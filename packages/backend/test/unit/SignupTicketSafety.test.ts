/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi } from 'vitest';
import { IsNull } from 'typeorm';
import { SignupApiService } from '@/server/api/SignupApiService.js';
import { SignupService } from '@/core/SignupService.js';

const makeService = (type: any, fields: Record<string, unknown>): any => Object.assign(Object.create(type.prototype), fields);

describe('registration ticket safety', () => {
	test.each([0, 1])('only the request that detaches the expired pending may delete it (affected=%s)', async affected => {
		const tickets = {
			update: vi.fn().mockResolvedValueOnce({ affected: 0 }).mockResolvedValueOnce({ affected }).mockResolvedValueOnce({ affected: 1 }),
			findOneBy: vi.fn().mockResolvedValue({ id: 'ticket', pendingUserId: 'old' }),
		};
		const pending = { findOneBy: vi.fn().mockResolvedValue({ id: 'old' }), delete: vi.fn() };
		const service = makeService(SignupApiService, {
			meta: { emailRequiredForSignup: true }, registrationTicketsRepository: tickets, userPendingsRepository: pending,
			idService: { parse: () => ({ date: new Date(0) }) },
		});
		expect(await service.claimRegistrationTicket({ id: 'ticket' })).toBe(affected === 1);
		expect(tickets.update).toHaveBeenNthCalledWith(2, { id: 'ticket', pendingUserId: 'old', usedById: IsNull() }, { pendingUserId: null });
		expect(pending.delete).toHaveBeenCalledTimes(affected);
		expect(tickets.update).toHaveBeenCalledTimes(affected === 1 ? 3 : 2);
		if (affected) expect(tickets.update.mock.invocationCallOrder[1]).toBeLessThan(pending.delete.mock.invocationCallOrder[0]);
	});

	test.each([false, true])('duplicate failure releases the ticket in approval=%s flow', async approval => {
		const tickets = { findOneBy: vi.fn().mockResolvedValue({ id: 'ticket', skipApproval: false }), update: vi.fn().mockResolvedValue({ affected: 1 }) };
		const service = makeService(SignupApiService, {
			meta: { approvalRequiredForSignup: approval }, registrationTicketsRepository: tickets,
			usersRepository: { exists: vi.fn().mockResolvedValue(true) },
			signupService: { signup: vi.fn().mockRejectedValue(new Error('DUPLICATED_USERNAME')) },
		});
		await expect(service.signup({ body: { username: 'existing', password: 'pass', invitationCode: 'invite', reason: '' } }, {})).rejects.toThrow();
		expect(tickets.update).toHaveBeenCalledWith({ id: 'ticket', usedById: IsNull() }, { usedAt: null, pendingUserId: null });
	});

	test.each([false, true])('post-commit failure retains the ticket in approval=%s flow', async approval => {
		const tickets = { findOneBy: vi.fn().mockResolvedValue({ id: 'ticket', skipApproval: false }), update: vi.fn().mockResolvedValue({ affected: 1 }) };
		const service = makeService(SignupApiService, {
			meta: { approvalRequiredForSignup: approval }, registrationTicketsRepository: tickets,
			signupService: { signup: async (opts: any) => { opts.onCommitted(); throw new Error('notification failed'); } },
		});
		await expect(service.signup({ body: { username: 'new', password: 'pass', invitationCode: 'invite', reason: '' } }, {})).rejects.toThrow();
		expect(tickets.update).toHaveBeenCalledTimes(1);
	});

	test.each(['duplicate', 'rollback', 'committed'])('SignupService reports only its own successful commit: %s', async outcome => {
		const onCommitted = vi.fn();
		const service = makeService(SignupService, {
			meta: { validateMinimumUsernameLength: 1 },
			userEntityService: { validateLocalUsername: () => true },
			usersRepository: { exists: async () => outcome === 'duplicate', count: async () => 1 },
			usedUsernamesRepository: { exists: async () => false },
			utilityService: { toPunyNullable: () => null }, idService: { gen: () => 'newid' },
			db: { transaction: async (cb: any) => {
				await cb({ query: async () => [], findOneBy: async () => null, save: async (value: any) => value });
				if (outcome === 'rollback') throw new Error('rollback');
			} },
			usersChart: { update: () => { throw new Error('post-commit'); } },
		});
		await expect(service.signup({ username: 'new', passwordHash: 'hash', onCommitted })).rejects.toThrow();
		expect(onCommitted).toHaveBeenCalledTimes(outcome === 'committed' ? 1 : 0);
	});
});

describe('signup interval reservation', () => {
	test.each(['normal', 'approval', 'email'])('%s releases pre-commit failures but retains committed reservations', async flow => {
		for (const outcome of ['failed', 'committed', 'success', 'replaced', 'denied'] as const) {
			let storedToken: string | null = null;
			const redis = {
				get: vi.fn().mockResolvedValue(null),
				set: vi.fn(async (_key: string, token: string) => {
					if (outcome === 'denied') return null;
					storedToken = token;
					return 'OK';
				}),
				eval: vi.fn(async (_script: string, _count: number, _key: string, token: string) => {
					if (storedToken === token) storedToken = null;
				}),
			};
			const failBeforeCommit = () => {
				if (outcome === 'replaced') storedToken = 'another-reservation';
				if (outcome === 'failed' || outcome === 'replaced') throw new Error('creation failed');
			};
			const service = makeService(SignupApiService, {
				meta: { secondsPerSignup: 60, approvalRequiredForSignup: flow === 'approval', emailRequiredForSignup: flow === 'email', preservedUsernames: [] },
				redisClient: redis, config: { url: 'https://local.example' }, idService: { gen: () => 'pending' },
				usersRepository: { exists: async () => false }, usedUsernamesRepository: { exists: async () => false },
				userPendingsRepository: { insertOne: async () => { failBeforeCommit(); return { id: 'pending' }; } },
				emailService: {
					validateEmailForAccount: async () => ({ available: true }),
					sendEmail: () => { if (outcome === 'committed') throw new Error('email failed'); },
				},
				roleService: { getAdministrators: async () => [] }, userEntityService: { pack: async () => ({}) },
				signupService: { signup: async (opts: any) => {
					failBeforeCommit();
					opts.onCommitted();
					if (outcome === 'committed') throw new Error('notification failed');
					return { account: { id: 'account' }, secret: 'local-test' };
				} },
			});
			const result = service.signup({ body: { username: 'new', password: 'pass', reason: '', emailAddress: 'new@example.com' } }, { code: vi.fn() });
			if (outcome === 'success') await result;
			else await expect(result).rejects.toThrow();
			expect(redis.set).toHaveBeenCalledWith('signup:slotReserved', expect.stringMatching(/^[0-9a-f-]{36}$/), 'PX', 60000, 'NX');
			expect(redis.eval).toHaveBeenCalledTimes(outcome === 'failed' || outcome === 'replaced' ? 1 : 0);
			if (outcome === 'failed' || outcome === 'denied') expect(storedToken).toBeNull();
			else if (outcome === 'replaced') expect(storedToken).toBe('another-reservation');
			else expect(storedToken).toBe(redis.set.mock.calls[0][1]);
		}
	});
});
