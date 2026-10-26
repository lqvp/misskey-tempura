/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import bcrypt from 'bcryptjs';
import { describe, expect, test, vi } from 'vitest';
import { SubAccountService } from '@/core/SubAccountService.js';
import RegenerateToken from '@/server/api/endpoints/i/regenerate-token.js';

describe('i/regenerate-token with a failing sub-account revocation', () => {
	test('the main token is not rotated when a sub-account revocation throws, and a retry succeeds', async () => {
		const hash = await bcrypt.hash('pw', 4);
		const users: Record<string, { id: string; token: string }> = { main: { id: 'main', token: 'main_token_0000000' } };
		const usersRepository = {
			findOneByOrFail: async () => ({ ...users.main }),
			update: vi.fn(async (_id: string, patch: any) => { Object.assign(users.main, patch); }),
		};
		const profiles = { findOneByOrFail: async () => ({ password: hash }) };
		const events = { publishInternalEvent: vi.fn(), publishMainStream: vi.fn() };
		let calls = 0;
		const subAccountService = {
			invalidateSubAccountTokens: vi.fn(async () => { if (++calls === 1) throw new Error('boom'); return ['subA']; }),
		};
		const ep = new RegenerateToken(usersRepository as never, profiles as never, events as never, subAccountService as never);
		const before = users.main.token;

		await expect(ep.exec({ password: 'pw' }, { id: 'main' } as never, null)).rejects.toThrow();
		expect(users.main.token).toBe(before);
		expect(usersRepository.update).not.toHaveBeenCalled();
		expect(events.publishInternalEvent).not.toHaveBeenCalled();

		await ep.exec({ password: 'pw' }, { id: 'main' } as never, null);
		expect(users.main.token).not.toBe(before);
		expect(subAccountService.invalidateSubAccountTokens).toHaveBeenCalledTimes(2);
	});
});

describe('SubAccountService.invalidateSubAccountTokens with a mid-way failure', () => {
	test('earlier subs stay revoked, the failure propagates, and a retry revokes every sub', async () => {
		const users: Record<string, any> = {
			s1: { id: 's1', parentUserId: 'm', token: 'tok_s1_000000000' },
			s2: { id: 's2', parentUserId: 'm', token: 'tok_s2_000000000' },
			s3: { id: 's3', parentUserId: 'm', token: 'tok_s3_000000000' },
		};
		const old = Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.token]));
		let failOnce = true;
		const usersRepository = {
			findBy: async () => Object.values(users).map(u => ({ ...u })),
			update: async (id: string, patch: any) => {
				if (id === 's2' && failOnce) { failOnce = false; throw new Error('boom'); }
				Object.assign(users[id], patch);
			},
		};
		const deleted: string[] = [];
		const accessTokensRepository = { delete: async (w: any) => { deleted.push(w.userId); } };
		const events = { publishInternalEvent: vi.fn(), publishMainStream: vi.fn() };
		const none = undefined as never;
		const service = new SubAccountService(usersRepository as never, accessTokensRepository as never, none, none, none, none, none, none, none, events as never, none, none);

		await expect(service.invalidateSubAccountTokens('m')).rejects.toThrow('boom');
		expect(users.s1.token).not.toBe(old.s1);
		expect(users.s2.token).toBe(old.s2);
		expect(users.s3.token).toBe(old.s3);

		await service.invalidateSubAccountTokens('m');
		for (const k of ['s1', 's2', 's3']) expect(users[k].token).not.toBe(old[k]);
		expect(deleted).toEqual(expect.arrayContaining(['s1', 's2', 's3']));
	});
});
