/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { PREF_CARRYOVER, STORE_CARRYOVER, collectReferences, sanitizeAfterProbe } from '@/utility/sub-account-carryover.js';

// Completeness (every key classified) is enforced by the type of the tables.
// These tests pin the classes that must never change by accident.
describe('sub-account carryover classification', () => {
	test('credentials and other accounts are never copied', () => {
		for (const k of ['accountTokens', 'accountInfos', 'pluginTokens', 'geminiToken', 'memo'] as const) {
			expect(STORE_CARRYOVER[k]).toBe('never');
		}
		for (const k of ['accounts', 'plugins', 'geminiToken'] as const) {
			expect(PREF_CARRYOVER[k]).toBe('never');
		}
	});

	test('settings that point at account-owned objects are probed first', () => {
		for (const k of ['pinnedUserLists', 'uploadFolder', 'widgets', 'statusbars', 'menu', 'deck.profiles'] as const) {
			expect(PREF_CARRYOVER[k]).toBe('copy-after-probe');
		}
	});

	test('device-only state is not carried', () => {
		for (const k of ['tips', 'darkMode', 'recentlyUsedEmojis', 'recentlyUsedUsers'] as const) {
			expect(STORE_CARRYOVER[k]).toBe('never');
		}
	});
});

describe('sub-account carryover references', () => {
	const widgets = [
		{ name: 'a', id: '1', data: { listId: 'L1' } },
		{ name: 'b', id: '2', data: { antennaId: 'A1', channelId: 'C1' } },
		{ name: 'c', id: '3', data: {} },
	];

	test('collects references from nested values', () => {
		expect(collectReferences('widgets', widgets).map(r => `${r.type}:${r.id}`).sort()).toEqual(['antenna:A1', 'channel:C1', 'list:L1']);
		expect(collectReferences('uploadFolder', 'F1')).toEqual([{ type: 'driveFolder', id: 'F1' }]);
		expect(collectReferences('pinnedUserLists', [{ id: 'L9', name: 'x' }])).toEqual([{ type: 'list', id: 'L9' }]);
	});

	test('removes only the widgets that hold an unusable reference', () => {
		const r = sanitizeAfterProbe('widgets', widgets, [{ type: 'list', id: 'L1' }, { type: 'antenna', id: 'A1' }]);
		expect(r.removed).toBe(1);
		expect((r.value as { id: string }[]).map(w => w.id)).toEqual(['1', '3']);
	});

	test('nothing usable empties every referencing item, bare references become null', () => {
		expect(sanitizeAfterProbe('widgets', widgets, []).removed).toBe(2);
		expect(sanitizeAfterProbe('uploadFolder', 'F1', [])).toEqual({ value: null, removed: 1 });
		expect(sanitizeAfterProbe('pinnedUserLists', [{ id: 'L9' }], [])).toEqual({ value: [], removed: 1 });
	});

	test('a deck profile with an unusable reference is removed whole', () => {
		const profiles = [['p1', { columns: [{ id: 'x', listId: 'L1' }] }], ['p2', { columns: [{ id: 'y' }] }]];
		const r = sanitizeAfterProbe('deck.profiles', profiles, []);
		expect(r.removed).toBe(1);
		expect((r.value as unknown[][]).map(p => p[0])).toEqual(['p2']);
	});
});
