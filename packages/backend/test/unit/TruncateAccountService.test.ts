/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { TruncateAccountService } from '@/core/TruncateAccountService.js';

function createService(options: {
	userExists?: boolean;
} = {}) {
	const { userExists = true } = options;

	const usersRepository = {
		findOneByOrFail: vi.fn(async (where: { id: string }) => {
			if (!userExists) {
				throw new Error('UserNotFound');
			}
			return { id: where.id, host: null };
		}),
	};

	const queueService = {
		createTruncateAccountJob: vi.fn(),
	};

	const service = new TruncateAccountService(
		usersRepository as any,
		queueService as any,
	);

	return { service, usersRepository, queueService };
}

describe('TruncateAccountService', () => {
	test('queues a truncate account job for the given user', async () => {
		const { service, usersRepository, queueService } = createService();

		const user = { id: 'user1', host: null };
		await service.truncateAccount(user);

		expect(usersRepository.findOneByOrFail).toHaveBeenCalledWith({ id: 'user1' });
		expect(queueService.createTruncateAccountJob).toHaveBeenCalledTimes(1);
		expect(queueService.createTruncateAccountJob).toHaveBeenCalledWith(user);
	});

	test('does not queue a job when the user does not exist', async () => {
		const { service, queueService } = createService({ userExists: false });

		await expect(service.truncateAccount({ id: 'missing', host: null })).rejects.toThrow('UserNotFound');
		expect(queueService.createTruncateAccountJob).not.toHaveBeenCalled();
	});

	test('keeps the original host information of the user', async () => {
		const { service, queueService } = createService();

		const user = { id: 'remote1', host: 'example.com' };
		await service.truncateAccount(user);

		expect(queueService.createTruncateAccountJob).toHaveBeenCalledWith({
			id: 'remote1',
			host: 'example.com',
		});
	});
});
