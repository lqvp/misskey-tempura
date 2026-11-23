/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { api } from '../../../../packages/frontend/test/e2e/shared';
import { sleep } from './server';
import type { HeadlessChromeController } from './controller';
import type { LongSessionCheckpoint } from './types';

type HeapSnapshot = {
	snapshot: { meta: { node_fields: string[]; edge_fields: string[]; edge_types: (string[] | string)[]; }; };
	nodes: number[];
	edges: number[];
	strings: string[];
};

export function countRetainedMatchReasons({ snapshot: { meta }, nodes, edges, strings }: HeapSnapshot, noteIds: Set<string>): number {
	const edgeCount = meta.node_fields.indexOf('edge_count');
	const edgeType = meta.edge_fields.indexOf('type');
	const edgeName = meta.edge_fields.indexOf('name_or_index');
	const edgeTarget = meta.edge_fields.indexOf('to_node');
	const types = meta.edge_types[edgeType];
	if ([edgeCount, edgeType, edgeName, edgeTarget].includes(-1) || !Array.isArray(types)) {
		throw new Error('Unexpected heap snapshot format');
	}
	const property = types.indexOf('property');
	const reasonObjects = new Set<number>();
	const noteReferences = new Map<string, Set<number>>();
	let edgeIndex = 0;
	for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += meta.node_fields.length) {
		let matched = false;
		let excluded = false;
		const edgeEnd = edgeIndex + nodes[nodeIndex + edgeCount] * meta.edge_fields.length;
		for (; edgeIndex < edgeEnd; edgeIndex += meta.edge_fields.length) {
			if (edges[edgeIndex + edgeType] !== property) continue;
			const name = strings[edges[edgeIndex + edgeName]];
			if (name === 'matchedKeywords') matched = true;
			if (name === 'matchedExcludeKeywords') excluded = true;
			if (noteIds.has(name)) {
				const targets = noteReferences.get(name) ?? new Set<number>();
				targets.add(edges[edgeIndex + edgeTarget]);
				noteReferences.set(name, targets);
			}
		}
		if (matched && excluded) reasonObjects.add(nodeIndex);
	}
	return [...noteReferences.values()].filter(targets => [...targets].some(target => reasonObjects.has(target))).length;
}

export async function runLongSessionScenario(chrome: HeadlessChromeController, baseUrl: string): Promise<LongSessionCheckpoint[]> {
	const { page } = chrome;
	const token = await page.evaluate(() => {
		localStorage.setItem('lang', 'en-US');
		const account = localStorage.getItem('account');
		return account == null ? undefined : (JSON.parse(account) as { token?: string }).token;
	});
	if (!token) throw new Error('Test signup did not persist a session token');

	const keyword = 'diagnostics-antenna-match';
	const antenna = await api(baseUrl, 'antennas/create', {
		i: token, name: 'Diagnostics', src: 'all', keywords: [[keyword]], excludeKeywords: [], users: [],
		caseSensitive: false, withReplies: false, withFile: false, localOnly: true,
	}) as { id: string };
	const streamedIds = new Set<string>();
	page.on('websocket', ws => {
		if (new URL(ws.url()).pathname !== '/streaming') return;
		ws.on('framereceived', ({ payload }) => {
			if (typeof payload !== 'string' || !payload.startsWith('{')) return;
			const event = JSON.parse(payload);
			if (event.type === 'channel' && event.body?.type === 'noteMatched') streamedIds.add(event.body.body.noteId);
		});
	});
	await page.goto(`${baseUrl}/timeline/antenna/${antenna.id}`);

	const sourceNotice = page.getByRole('button', { name: 'Got it!', exact: true });
	if (await sourceNotice.isVisible()) await sourceNotice.click();

	const widgetEdit = page.getByTestId('widget-edit');
	await widgetEdit.click();
	await page.getByTestId('widget-select').locator('[tabindex="0"]').press('Enter');
	await page.getByRole('menu').getByText('Activity', { exact: true }).click({ timeout: 10_000 });
	await page.getByTestId('widget-add').click();
	await page.locator('[data-testid="widget-add"] + button').click();
	const widget = page.getByTestId('mkw-activity');
	await widget.locator('button:has(.ti-selector)').click();
	const chart = widget.locator('svg:has(polyline)');
	await chart.waitFor({ state: 'visible' });

	const checkpoints: LongSessionCheckpoint[] = [];
	const posted = new Set<string>();
	const displayedNotes = page.locator('[data-scroll-anchor]');

	async function checkpoint(stage: string) {
		const snapshot = await chrome.takeHeapSnapshot() as HeapSnapshot;
		const retainedMatchReasons = countRetainedMatchReasons(snapshot, posted);
		const renderedIds = await displayedNotes.evaluateAll(elements => elements.map(el => el.getAttribute('data-scroll-anchor')));
		const renderedNotes = renderedIds.filter(id => id != null && posted.has(id)).length;
		const metrics = { stage, retainedMatchReasons, renderedNotes, ...await chrome.collectLongSessionMetrics() };
		checkpoints.push(metrics);
		process.stderr.write(`[long-session] ${JSON.stringify(metrics)}\n`);
	}

	async function postNotes(count: number, waitForStream = true) {
		for (let i = 0; i < count; i++) {
			const { createdNote } = await api(baseUrl, 'notes/create', {
				i: token, text: `${keyword} note ${posted.size + 1}`,
			}) as { createdNote: { id: string } };
			posted.add(createdNote.id);
		}
		if (!waitForStream) return;
		const deadline = Date.now() + 30_000;
		while ([...posted].some(id => !streamedIds.has(id))) {
			if (Date.now() >= deadline) throw new Error(`Only received ${streamedIds.size}/${posted.size} noteMatched events`);
			await sleep(50);
		}
	}

	async function dragChart(count: number) {
		for (let i = 0; i < count; i++) {
			await chart.dispatchEvent('mousedown', { clientX: 80, clientY: 40 });
			await page.evaluate(() => {
				window.dispatchEvent(new MouseEvent('mousemove', { clientX: 85, clientY: 35 }));
				window.dispatchEvent(new MouseEvent('mouseup'));
			});
		}
	}

	await checkpoint('initial');
	await postNotes(80);
	const lastDisplayed = page.getByText(`${keyword} note 80`, { exact: true });
	await lastDisplayed.waitFor({ state: 'visible' });
	await dragChart(100);
	await checkpoint('after-live-notes');

	await lastDisplayed.evaluate(el => {
		for (let container = el.parentElement; container; container = container.parentElement) {
			if (['auto', 'scroll'].includes(getComputedStyle(container).overflowY) && container.scrollHeight > container.clientHeight) {
				container.scrollTop = 500;
				if (container.scrollTop === 0) throw new Error('Timeline did not scroll');
				return;
			}
		}
		throw new Error('Missing timeline scroll container');
	});
	await postNotes(160);
	const releaseQueue = page.locator('button:has(> .ti-circle-arrow-up)');
	await releaseQueue.waitFor({ state: 'visible', timeout: 10_000 });
	await dragChart(100);
	await checkpoint('after-queued-notes');

	await releaseQueue.click();
	const latest = displayedNotes.filter({ hasText: `${keyword} note 240` });
	await latest.getByText(keyword, { exact: true }).waitFor({ state: 'visible' });
	await checkpoint('after-queue-release');

	await chart.dispatchEvent('mousedown', { clientX: 80, clientY: 40 });
	await widgetEdit.dispatchEvent('click');
	await page.getByTestId('customize-container').filter({ has: widget }).getByTestId('customize-container-remove').dispatchEvent('click');
	await widget.waitFor({ state: 'detached' });
	await checkpoint('after-widget-removal');

	const reload = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
	await page.locator('button:has(.ti-bolt)').first().click();
	await page.locator('[role="menuitem"]:has(> .ti-bolt-off)').click({ timeout: 10_000 });
	await reload;
	await page.getByText(`${keyword} note 240`, { exact: true }).waitFor({ state: 'visible' });
	await checkpoint('before-polling');
	await postNotes(25, false);
	await page.getByText(`${keyword} note 265`, { exact: true }).waitFor({ state: 'visible' });
	await postNotes(25, false);
	await page.getByText(`${keyword} note 290`, { exact: true }).waitFor({ state: 'visible' });
	await checkpoint('after-polling');
	return checkpoints;
}
