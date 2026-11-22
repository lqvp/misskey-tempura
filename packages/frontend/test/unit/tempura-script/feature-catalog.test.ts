/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import markdown from '../../../../../diff.md?raw';
import { countFeatureItems, fetchFeatureCatalog, parseFeatureCatalog, searchFeatureCatalog } from '@/utility/tempura-script/feature-catalog.js';

describe('feature catalog', () => {
	const source = [
		'# Guide',
		'Introduction',
		'注意事項',
		'* Requires a role',
		'## Antennas',
		'### Keyword matching',
		'A paragraph',
		'continued here',
		'',
		'* RE2 patterns',
		'  * No lookbehind',
		'    supported here',
		'* Plain text',
		'',
		'## Uploads',
		'* Image processing',
	].join('\r\n');

	test('preserves preamble, headings, nested conditions and multiline paragraphs', () => {
		const document = parseFeatureCatalog(source);
		expect(document.introduction).toBe('Introduction');
		expect(document.notes).toEqual(['Requires a role']);
		expect(document.sections.map(section => section.title)).toEqual(['Antennas', 'Uploads']);
		expect(document.sections[0].groups[0]).toEqual({
			title: 'Keyword matching',
			paragraphs: ['A paragraph continued here'],
			items: [
				{ text: 'RE2 patterns', children: ['No lookbehind supported here'] },
				{ text: 'Plain text', children: [] },
			],
		});
		expect(countFeatureItems(document.sections[0])).toBe(2);
	});

	test('searches normalized text and retains the parent and heading of nested matches', () => {
		const { sections } = parseFeatureCatalog(source);
		const result = searchFeatureCatalog(sections, 'ＡＮＴＥＮＮＡＳ lookbehind');
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(sections[0].id);
		expect(result[0].groups[0].title).toBe('Keyword matching');
		expect(result[0].groups[0].items.map(item => item.text)).toEqual(['RE2 patterns']);
		expect(searchFeatureCatalog(sections, 'uploads')[0].groups[0].items).toHaveLength(1);
		expect(searchFeatureCatalog(sections, 'missing')).toEqual([]);
		expect(searchFeatureCatalog(sections, '  ')).toBe(sections);
		expect(sections[0].groups[0].items).toHaveLength(2);
	});

	test('includes every category and list item from the real single source', () => {
		const visible = markdown.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
		const document = parseFeatureCatalog(`<!--\n## Hidden\n* hidden item\n  * hidden child\n-->\n${markdown}`);
		expect(document.sections.map(section => section.title)).toEqual(
			[...visible.matchAll(/^## (.+)$/gm)].map(match => match[1]),
		);
		const items = document.sections.flatMap(section => section.groups.flatMap(group => group.items));
		expect(items.length + document.notes.length).toBe([...visible.matchAll(/^\* /gm)].length);
		expect(items.flatMap(item => item.children)).toHaveLength([...visible.matchAll(/^ +\* /gm)].length);
	});

	test('shows matching explanations without counting unrelated features', () => {
		const { sections } = parseFeatureCatalog(source);
		const [result] = searchFeatureCatalog(sections, 'antennas paragraph');
		expect(result.groups[0].paragraphs).toEqual(['A paragraph continued here']);
		expect(result.groups[0].items).toEqual([]);
		expect(countFeatureItems(result)).toBe(0);
		expect(searchFeatureCatalog(sections, 'keyword')[0].groups[0].items).toHaveLength(2);
		expect(sections[0].groups[0].items).toHaveLength(2);
	});

	test('handles an empty document', () => {
		expect(parseFeatureCatalog('')).toEqual({ introduction: '', notes: [], sections: [] });
	});

	test('excludes multiline, inline and unfinished maintainer comments from display and search', () => {
		const catalog = parseFeatureCatalog(`<!-- private instructions\n## Hidden\n* secret\n-->\n${source}\n<!-- unfinished secret`);
		expect(catalog).toEqual(parseFeatureCatalog(source));
		expect(searchFeatureCatalog(catalog.sections, 'secret')).toEqual([]);
		expect(parseFeatureCatalog('## Visible\n* Before <!-- secret -->after').sections[0].groups[0].items[0].text).toBe('Before after');
	});

	test('does not hide literal comment openers in inline code or later categories', () => {
		const catalog = parseFeatureCatalog('## A\n* HTML `<!--` example\n* Two backticks ``<!--``\n## B\n* later');
		expect(catalog.sections.map(section => section.title)).toEqual(['A', 'B']);
		expect(catalog.sections[0].groups[0].items.map(item => item.text)).toEqual(['HTML `<!--` example', 'Two backticks ``<!--``']);
	});
});

describe('fetchFeatureCatalog', () => {
	afterEach(() => vi.unstubAllGlobals());

	test('fetches and parses a standalone asset', async () => {
		const request = vi.fn().mockResolvedValue(new Response(markdown));
		vi.stubGlobal('fetch', request);
		const catalog = await fetchFeatureCatalog('/vite/assets/catalog.md', new AbortController().signal);
		expect(catalog).toEqual(parseFeatureCatalog(markdown));
		expect(request).toHaveBeenCalledWith('/vite/assets/catalog.md', { signal: expect.any(AbortSignal) });
	});

	test('rejects HTTP errors and successful HTML fallback responses', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not found', { status: 404 })));
		await expect(fetchFeatureCatalog('/missing.md', new AbortController().signal)).rejects.toThrow('404');
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Fallback</html>')));
		await expect(fetchFeatureCatalog('/missing.md', new AbortController().signal)).rejects.toThrow('no categories');
	});

	test('propagates network failures and cancellation so the page can retry or unmount', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Offline')));
		await expect(fetchFeatureCatalog('/catalog.md', new AbortController().signal)).rejects.toThrow('Offline');
		vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, { signal }) => {
			signal.throwIfAborted();
		}));
		const controller = new AbortController();
		controller.abort();
		await expect(fetchFeatureCatalog('/catalog.md', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
	});
});
