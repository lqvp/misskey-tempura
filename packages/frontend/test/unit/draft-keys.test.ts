/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { migrateDraftKeys, scopedDraftKey } from '@/utility/draft-keys.js';

describe('scopedDraftKey', () => {
	test('prefixes the user id', () => {
		expect(scopedDraftKey('u1', 'reply:n1')).toBe('u1::reply:n1');
	});
});

describe('migrateDraftKeys', () => {
	const drafts = { 'note:uA': 'a', 'reply:n1': 'r', 'channel:c1note:uB': 'c', 'user:x': 'chat' };

	test('keeps old keys and moves by owner when there are two or more accounts', () => {
		const out = migrateDraftKeys(drafts, ['uA', 'uB']);
		expect(out).toMatchObject(drafts);
		expect(out['uA::note:uA']).toBe('a');
		expect(out['uB::channel:c1note:uB']).toBe('c');
		expect(out['uA::reply:n1']).toBeUndefined();
		expect(out['uB::reply:n1']).toBeUndefined();
		expect(out['uA::user:x']).toBeUndefined();
	});

	test('one saved account owns every unowned key', () => {
		const out = migrateDraftKeys(drafts, ['uA']);
		expect(out['uA::reply:n1']).toBe('r');
		expect(out['uA::user:x']).toBe('chat');
		expect(out['reply:n1']).toBe('r');
	});

	test('does not overwrite an existing new key and is idempotent', () => {
		const once = migrateDraftKeys({ ...drafts, 'uA::reply:n1': 'newer' }, ['uA']);
		expect(once['uA::reply:n1']).toBe('newer');
		expect(migrateDraftKeys(once, ['uA'])).toEqual(once);
	});

	test('renote IDs are not mistaken for account IDs', () => {
		expect(migrateDraftKeys({ 'renote:n1': 'quote', 'channel:c1renote:n2': 'quote' }, ['uA', 'uB'])).toEqual({ 'renote:n1': 'quote', 'channel:c1renote:n2': 'quote' });
	});

	test('no accounts: nothing moves', () => {
		expect(migrateDraftKeys({ 'reply:n1': 'r' }, [])).toEqual({ 'reply:n1': 'r' });
	});
});
