/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { decideAccount, parseAccountParam, pickFirstAccountId, withAccount } from '@/utility/pinned-account.js';
import { resolveBootAccount } from '@/utility/boot-account.js';

const prefs = (accounts: [string, { id: string; username: string }][]) => JSON.stringify({
	preferences: { accounts: [[{}, accounts, {}]] },
});

describe('parseAccountParam', () => {
	test('absent / ok / invalid', () => {
		expect(parseAccountParam('', 'as')).toEqual({ kind: 'absent' });
		expect(parseAccountParam('?as=9abc', 'as')).toEqual({ kind: 'ok', id: '9abc' });
		expect(parseAccountParam('?as=', 'as')).toEqual({ kind: 'invalid' });
		expect(parseAccountParam('?as=a&as=b', 'as')).toEqual({ kind: 'invalid' });
		expect(parseAccountParam('?as=a%20b', 'as')).toEqual({ kind: 'invalid' });
		expect(parseAccountParam('?as=../x', 'as')).toEqual({ kind: 'invalid' });
	});
});

describe('decideAccount', () => {
	test('order: as > loginId > first (no query is always the first account)', () => {
		expect(decideAccount({ search: '?as=a&loginId=b', firstId: 'f' })).toEqual({ kind: 'id', id: 'a', source: 'as' });
		expect(decideAccount({ search: '?loginId=b', firstId: 'f' })).toEqual({ kind: 'id', id: 'b', source: 'loginId' });
		expect(decideAccount({ search: '', firstId: 'f' })).toEqual({ kind: 'id', id: 'f', source: 'first' });
		expect(decideAccount({ search: '', firstId: null })).toEqual({ kind: 'none' });
	});
	test('invalid ?as never falls back', () => {
		expect(decideAccount({ search: '?as=', firstId: 'f' })).toEqual({ kind: 'invalid' });
		expect(decideAccount({ search: '?loginId=', firstId: 'f' })).toEqual({ kind: 'invalid' });
	});
});

describe('pickFirstAccountId', () => {
	test('first account on this host, even if its token is missing', () => {
		const p = prefs([['h', { id: 'a', username: 'a' }], ['h', { id: 'b', username: 'b' }]]);
		expect(pickFirstAccountId(p, 'h')).toBe('a');
		expect(pickFirstAccountId(p, 'other')).toBeNull();
	});
	test('broken or missing data', () => {
		expect(pickFirstAccountId(null, 'h')).toBeNull();
		expect(pickFirstAccountId('{', 'h')).toBeNull();
		expect(pickFirstAccountId('{"preferences":{}}', 'h')).toBeNull();
	});
});

describe('withAccount', () => {
	test('adds, replaces and removes; keeps query and hash', () => {
		expect(withAccount('/notes/x', 'a')).toBe('/notes/x?as=a');
		expect(withAccount('/search?q=1#h', 'a')).toBe('/search?q=1&as=a#h');
		expect(withAccount('/x?as=old&loginId=z', 'a')).toBe('/x?as=a');
		expect(withAccount('/x?as=old', null)).toBe('/x');
		expect(withAccount('https://example.com/x?y=1', 'a')).toBe('https://example.com/x?y=1&as=a');
	});
});

describe('resolveBootAccount', () => {
	const info = { id: 'b', username: 'bob' };
	const base = { accountTokens: { 'h/b': 'tok-b', 'h/c': 'tok-c' }, accountInfos: { 'h/b': info, 'h/c': { id: 'c', username: 'cy' } } };
	const common = {
		host: 'h',
		prefsJson: prefs([['h', { id: 'b', username: 'bob' }], ['h', { id: 'c', username: 'cy' }]]),
		legacyAccountJson: JSON.stringify({ id: 'c', username: 'cy', token: 'legacy' }),
		getBase: async () => base,
	};
	test('stops before accessing storage when cross-tab safe writes are unsupported', async () => {
		const r = await resolveBootAccount({ ...common, search: '', canSafelyWritePreferences: false, getBase: async () => { throw new Error('must not read'); } });
		expect(r).toMatchObject({ me: null, error: 'unsafe-storage' });
	});
	test('no query: topmost saved account, not the legacy one', async () => {
		const r = await resolveBootAccount({ ...common, search: '' });
		expect(r).toMatchObject({ id: 'b', source: 'first', error: null });
		expect(r.me?.token).toBe('tok-b');
	});
	test('?as picks that account', async () => {
		const r = await resolveBootAccount({ ...common, search: '?as=c' });
		expect(r).toMatchObject({ id: 'c', source: 'as', error: null });
	});
	test('unknown ?as stops, never falls back', async () => {
		const r = await resolveBootAccount({ ...common, search: '?as=zzz' });
		expect(r).toMatchObject({ me: null, error: 'unknown-account' });
	});
	test('first account is chosen again on every query-less boot, then pinned by ?as in the URL', async () => {
		const first = await resolveBootAccount({ ...common, search: '' });
		expect(first.id).toBe('b');
		// 起動後にURLへ ?as= を付ける(i.ts)。その URL で再読み込みしても同じアカウント
		const url = withAccount('/timeline?x=1#h', first.id);
		expect(url).toBe('/timeline?x=1&as=b#h');
		const reloaded = await resolveBootAccount({ ...common, search: new URL(url, 'http://x').search });
		expect(reloaded).toMatchObject({ id: 'b', source: 'as' });
	});
	test('missing info stops', async () => {
		const r = await resolveBootAccount({ ...common, search: '?as=b', getBase: async () => ({ accountTokens: base.accountTokens }) });
		expect(r).toMatchObject({ me: null, error: 'no-account-info' });
	});
	test('invalid ?as stops', async () => {
		const r = await resolveBootAccount({ ...common, search: '?as=' });
		expect(r).toMatchObject({ me: null, error: 'invalid-param' });
	});
	test('legacy fallback only when nothing else exists', async () => {
		const r = await resolveBootAccount({ ...common, prefsJson: null, search: '', getBase: async () => null });
		expect(r).toMatchObject({ id: 'c', source: 'legacy', error: null });
		const none = await resolveBootAccount({ ...common, prefsJson: null, legacyAccountJson: null, search: '', getBase: async () => null });
		expect(none).toMatchObject({ me: null, source: 'none', error: null });
	});
});
