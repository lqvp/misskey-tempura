/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapAccount } from '@/utility/tab-account-bootstrap.js';
import { miLocalStorage } from '@/local-storage.js';

const get = vi.fn();
vi.mock('@/utility/idb-proxy.js', () => ({ get: (...args: unknown[]) => get(...args) }));
const fetchAccount = vi.fn();
vi.stubGlobal('fetch', fetchAccount);
const profile = { preferences: { accounts: [[{}, [['example.test', { id: 'alice' }], ['example.test', { id: 'bob' }]], {}]] } };
beforeEach(() => {
	localStorage.clear();
	miLocalStorage.setItem('preferences', JSON.stringify(profile));
	miLocalStorage.setItem('account', JSON.stringify({ id: 'bob', token: 'wrong' }));
	get.mockResolvedValue({ accountTokens: { 'example.test/alice': 'a-token', 'example.test/bob': 'b-token' }, accountInfos: { 'example.test/alice': { id: 'alice', username: 'Alice' }, 'example.test/bob': { id: 'bob', username: 'Bob' } } });
	fetchAccount.mockReset();
	fetchAccount.mockResolvedValue({ ok: true, json: async () => ({ id: 'alice', username: 'Alice' }) });
});
describe('bootstrap selected identity before creating account state', () => {
	it('uses the saved first token, not the last global account', async () => {
		expect(await bootstrapAccount('https://example.test/', 'example.test')).toEqual({ id: 'alice', username: 'Alice', token: 'a-token' });
		expect(fetchAccount).not.toHaveBeenCalled();
	});
	it('stops a missing token or mismatching cached identity instead of using global account', async () => {
		get.mockResolvedValueOnce({ accountTokens: {} });
		await expect(bootstrapAccount('https://example.test/?as=alice', 'example.test')).rejects.toThrow();
		get.mockResolvedValueOnce({ accountTokens: { 'example.test/alice': 'a-token' }, accountInfos: { 'example.test/alice': { id: 'bob' } } });
		await expect(bootstrapAccount('https://example.test/?as=alice', 'example.test')).rejects.toThrow();
		expect(fetchAccount).not.toHaveBeenCalled();
	});
	it('uses verified-ID cached data without waiting for a network that is offline', async () => {
		fetchAccount.mockRejectedValue(new Error('offline'));
		expect((await bootstrapAccount('https://example.test/?as=alice', 'example.test'))?.id).toBe('alice');
		expect(fetchAccount).not.toHaveBeenCalled();
	});

	it('stops corrupt account preferences instead of silently selecting the shared account', async () => {
		miLocalStorage.setItem('preferences', '{');
		await expect(bootstrapAccount('https://example.test/', 'example.test')).rejects.toThrow();
	});
	it('does not take another server preference override before the device account list', async () => {
		miLocalStorage.setItem('preferences', JSON.stringify({ preferences: { accounts: [
			[{ server: 'other.test' }, [['other.test', { id: 'other' }]], {}],
			[{}, [['example.test', { id: 'alice' }]], {}],
		] } }));
		expect((await bootstrapAccount('https://example.test/', 'example.test'))?.id).toBe('alice');
	});

});
