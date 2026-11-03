/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ clear: vi.fn(async () => {}), logout: vi.fn(), flush: vi.fn(async () => { throw new Error('quota'); }) }));
vi.mock('@/i.js', () => ({ $i: { id: 'a', token: 'token' } }));
vi.mock('@/store.js', () => ({ store: { s: { enablePreferencesAutoCloudBackup: false } } }));
vi.mock('@/preferences.js', () => ({ prefer: { flush: mocks.flush } }));
vi.mock('@/preferences/utility.js', () => ({ cloudBackup: vi.fn() }));
vi.mock('@/os.js', () => ({ waiting: vi.fn() }));
vi.mock('@/utility/unison-reload.js', () => ({ unisonLogout: mocks.logout }));
vi.mock('@/preferences/lock.js', () => ({ withPreferenceLock: async (work: () => void) => work() }));
vi.mock('@/utility/idb-proxy.js', () => ({ clear: mocks.clear }));
import { signout } from '@/signout.js';

test('a rejected preference flush cannot strand logout with saved credentials', async () => {
 localStorage.setItem('account', 'credential');
 vi.stubGlobal('indexedDB', { deleteDatabase: () => { const request = { onsuccess: null as (() => void) | null }; queueMicrotask(() => request.onsuccess?.()); return request; } });
 await signout();
 expect(localStorage.getItem('account')).toBeNull();
 expect(mocks.clear).toHaveBeenCalledOnce();
 expect(mocks.logout).toHaveBeenCalledOnce();
});
