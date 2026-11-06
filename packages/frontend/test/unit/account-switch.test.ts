/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alert } from '@/os.js';
import { getAccountMenu, switchAccount } from '@/accounts.js';
const data = vi.hoisted(() => ({ s: { accountTokens: { 'localhost/bob': 'b-token' }, accountInfos: {} as Record<string, { id: string }> } }));
vi.mock('@/store.js', () => ({ store: { s: data.s, set: async (key: keyof typeof data.s, value: never) => { data.s[key] = value; } } }));
vi.mock('@/i.js', () => ({ $i: { id: 'alice', token: 'a-token' } }));
vi.mock('@@/js/config.js', () => ({ host: 'localhost', apiUrl: 'http://localhost/api' }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { accounts: [['localhost', { id: 'bob', username: 'bob' }]] }, commit: vi.fn() } }));
vi.mock('@/os.js', () => ({ alert: vi.fn(), waiting: vi.fn(), popup: vi.fn(), popupMenu: vi.fn(), success: vi.fn() }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { failedToFetchAccountInformation: 'Account fetch failed' } } }));
vi.mock('@/utility/unison-reload.js', () => ({ reloadChannel: { postMessage: vi.fn() }, unisonReload: vi.fn() }));
vi.mock('@/utility/show-suspended-dialog.js', () => ({ showSuspendedDialog: vi.fn() }));
const fetchAccount = vi.fn();
beforeEach(() => {
	window.location.href = 'http://localhost/';
	data.s.accountInfos = {};
	vi.mocked(alert).mockClear();
	fetchAccount.mockReset();
	fetchAccount.mockResolvedValue({ status: 200, json: async () => ({ id: 'bob', username: 'bob' }) });
	vi.stubGlobal('fetch', fetchAccount);
});
describe('switch account cache recovery', () => {
	it('fills missing cache before navigating to the selected ID', async () => {
		await switchAccount('localhost', 'bob');
		expect(fetchAccount).toHaveBeenCalledOnce();
		expect(data.s.accountInfos['localhost/bob'].id).toBe('bob');
		expect(new URL(window.location.href).searchParams.get('as')).toBe('bob');
	});
	it('does not fetch an already matching cached account', async () => {
		data.s.accountInfos['localhost/bob'] = { id: 'bob' };
		await switchAccount('localhost', 'bob');
		expect(fetchAccount).not.toHaveBeenCalled();
	});
	it('reports a mismatched response without caching or navigating', async () => {
		fetchAccount.mockResolvedValue({ status: 200, json: async () => ({ id: 'mallory' }) });
		await expect(switchAccount('localhost', 'bob')).resolves.toBeUndefined();
		expect(alert).toHaveBeenCalledWith({ type: 'error', title: 'Account fetch failed' });
		expect(new URL(window.location.href).searchParams.has('as')).toBe(false);
		expect(data.s.accountInfos['localhost/bob']).toBeUndefined();
	});
	it('reports network failure and leaves the current page unchanged', async () => {
		fetchAccount.mockRejectedValue(new Error('offline'));
		await expect(switchAccount('localhost', 'bob')).resolves.toBeUndefined();
		expect(alert).toHaveBeenCalledOnce();
		expect(data.s.accountInfos['localhost/bob']).toBeUndefined();
		expect(new URL(window.location.href).searchParams.has('as')).toBe(false);
	});
	it('does not create a direct account anchor without matching cache', async () => {
		const menu = await getAccountMenu({ withExtraOperation: false });
		expect(menu[0]).toMatchObject({ type: 'button' });
		data.s.accountInfos['localhost/bob'] = { id: 'bob' };
		const cached = await getAccountMenu({ withExtraOperation: false });
		expect(cached[0]).toMatchObject({ type: 'a' });
	});
});
