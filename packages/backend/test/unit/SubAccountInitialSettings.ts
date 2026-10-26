/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { SubAccountService } from '@/core/SubAccountService.js';

const none = undefined as never;

function setup(openUntil: Date | null, opts: { claimAffected?: number; setFails?: boolean } = {}) {
	const sub = { id: 'sub1', parentUserId: 'main1', isDeleted: false, initialSettingsOpenUntil: openUntil };
	const update = vi.fn(async () => ({}));
	const execute = vi.fn(async () => ({ affected: opts.claimAffected ?? 1 }));
	const qb = { update: () => qb, set: () => qb, where: () => qb, execute };
	const usersRepository = {
		findOneBy: async (w: { id: string; parentUserId: string }) => (w.id === 'sub1' && w.parentUserId === 'main1' ? sub : null),
		createQueryBuilder: () => qb,
		update,
	};
	const em = { createQueryBuilder: () => qb };
	// the real implementation runs `beforeWrite` (the claim) and the writes in one transaction; a failure rolls both back
	const set = vi.fn(async (_id: string, _items: unknown[], before?: (em: unknown) => Promise<void>) => {
		if (before) await before(em);
		if (opts.setFails) throw new Error('write failed');
	});
	const registryApiService = { setManyAtomically: set };
	const service = new SubAccountService(usersRepository as never, none, none, none, none, none, none, none, registryApiService as never, none, none, none);
	return { service, update, execute, set };
}

const item = { scope: ['client', 'base'], key: 'defaultNoteVisibility', value: 'home' };

describe('SubAccountService.saveInitialSettings', () => {
	test('saves while the window created at sign-up is open', async () => {
		const { service, set } = setup(new Date(Date.now() + 60_000));
		expect(await service.saveInitialSettings({ id: 'main1' }, 'sub1', [item])).toBe(1);
		expect(set).toHaveBeenCalledWith('sub1', [item], expect.any(Function));
	});

	test('refuses when the window was never opened, is used up, or has expired', async () => {
		for (const w of [null, new Date(Date.now() - 1)]) {
			const { service, set, execute } = setup(w);
			await expect(service.saveInitialSettings({ id: 'main1' }, 'sub1', [item])).rejects.toMatchObject({ code: 'INITIAL_SETTINGS_CLOSED' });
			expect(execute).not.toHaveBeenCalled();
			expect(set).not.toHaveBeenCalled();
		}
	});

	test('refuses when another call closed the window first (atomic claim)', async () => {
		const { service } = setup(new Date(Date.now() + 60_000), { claimAffected: 0 });
		// the claim runs first inside the transaction, so its refusal aborts before any write
		await expect(service.saveInitialSettings({ id: 'main1' }, 'sub1', [item])).rejects.toMatchObject({ code: 'INITIAL_SETTINGS_CLOSED' });
	});

	test('a write failure propagates; the claim is inside the same transaction (no compensating update outside it)', async () => {
		const { service, update } = setup(new Date(Date.now() + 60_000), { setFails: true });
		await expect(service.saveInitialSettings({ id: 'main1' }, 'sub1', [item])).rejects.toThrow('write failed');
		expect(update).not.toHaveBeenCalled();
	});

	test('another account cannot reach it, and credential keys or unknown scopes are rejected before anything is claimed', async () => {
		const open = new Date(Date.now() + 60_000);
		const other = setup(open);
		await expect(other.service.saveInitialSettings({ id: 'other' }, 'sub1', [item])).rejects.toMatchObject({ code: 'NO_SUCH_SUB_ACCOUNT' });
		for (const bad of [{ ...item, key: 'accountTokens' }, { ...item, scope: ['client', 'x'] }]) {
			const { service, execute } = setup(open);
			await expect(service.saveInitialSettings({ id: 'main1' }, 'sub1', [bad])).rejects.toMatchObject({ code: 'INITIAL_SETTINGS_REJECTED' });
			expect(execute).not.toHaveBeenCalled();
		}
	});
});
