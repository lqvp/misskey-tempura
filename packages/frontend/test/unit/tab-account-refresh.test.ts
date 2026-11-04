/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
	me: { id: 'alice', token: 'alice-token' },
	s: { accountTokens: { 'localhost:3000/alice': 'alice-token', 'localhost:3000/bob': 'bob-token' }, accountInfos: {} },
	set: vi.fn(), reload: vi.fn(),
}));
vi.mock('@/i.js', () => ({ $i: state.me }));
vi.mock('@/store.js', () => ({ store: { s: state.s, set: state.set } }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { accounts: [] } } }));
vi.mock('@/os.js', () => ({ waiting: vi.fn(), popup: vi.fn(), popupMenu: vi.fn(), success: vi.fn(), alert: vi.fn() }));
vi.mock('@/utility/show-suspended-dialog.js', () => ({ showSuspendedDialog: vi.fn() }));
vi.mock('@/utility/unison-reload.js', () => ({ reloadChannel: { postMessage: vi.fn() }, unisonReload: vi.fn() }));
import { refreshCurrentAccount } from '@/accounts.js';
beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal('location', { href: 'http://localhost:3000/?as=alice', reload: state.reload });
	state.set.mockImplementation(async (key: keyof typeof state.s, value: never) => { state.s[key] = value; });
	state.s.accountTokens = { 'localhost:3000/alice': 'alice-token', 'localhost:3000/bob': 'bob-token' };
});
it('removes only rejected credential before reloading the pinned account, without logging in Bob', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, json: async () => ({ error: { id: 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14' } }) }));
	await refreshCurrentAccount();
	expect(state.s.accountTokens).toEqual({ 'localhost:3000/bob': 'bob-token' });
	expect(state.me.id).toBe('alice');
	expect(window.location.href).toBe('http://localhost:3000/?as=alice');
	expect(state.reload).toHaveBeenCalledOnce();
});
it('rejects a successful response identifying a different user instead of mutating the pinned identity', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, json: async () => ({ id: 'bob', username: 'Bob' }) }));
	await refreshCurrentAccount();
	expect(state.me.id).toBe('alice');
	expect(state.reload).toHaveBeenCalledOnce();
});
