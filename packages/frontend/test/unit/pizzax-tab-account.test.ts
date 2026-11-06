/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Pizzax } from '@/lib/pizzax.js';
const handlers = vi.hoisted(() => new Map<string, (message: unknown) => void>());
vi.mock('broadcast-channel', () => ({ BroadcastChannel: class {
	constructor(private name: string) {}
	addEventListener(_: string, handler: (message: unknown) => void) { handlers.set(this.name, handler); }
	postMessage() {}
} }));
const account = vi.hoisted(() => ({ $i: { id: 'alice', token: 'a' } as { id: string; token: string } | null }));
vi.mock('@/i.js', () => ({ get $i() { return account.$i; } }));
vi.mock('@/store.js', () => ({ store: { s: {} } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: async () => ({}) }));
vi.mock('@/utility/idb-proxy.js', () => ({ get: async () => null, set: async () => {} }));
describe('Pizzax tab account boundary', () => {
	afterEach(() => { account.$i = { id: 'alice', token: 'a' }; });
	it('ignores account messages while signed out', async () => {
		account.$i = null;
		const state = new Pizzax('signed-out', { value: { where: 'deviceAccount', default: 'initial' } });
		await state.ready;
		handlers.get('pizzax::signed-out')!({ where: 'deviceAccount', key: 'value', value: 'wrong', userId: 'alice' });
		expect(state.s.value).toBe('initial');
	});
	it('ignores another account message, receives same account and device messages', async () => {
		const state = new Pizzax('tab-test', { value: { where: 'deviceAccount', default: 'initial' }, shared: { where: 'device', default: 'initial' } });
		await state.ready;
		const receive = handlers.get('pizzax::tab-test')!;
		receive({ where: 'deviceAccount', key: 'value', value: 'wrong', userId: 'bob' });
		expect(state.s.value).toBe('initial');
		receive({ where: 'deviceAccount', key: 'value', value: 'own', userId: 'alice' });
		expect(state.s.value).toBe('own');
		receive({ where: 'device', key: 'shared', value: 'shared', userId: 'bob' });
		expect(state.s.shared).toBe('shared');
	});
});
