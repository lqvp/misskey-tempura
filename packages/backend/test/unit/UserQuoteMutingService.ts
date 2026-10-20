/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable */

import { afterEach, beforeEach, describe, expect, beforeAll, afterAll, test } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { GlobalModule } from '@/GlobalModule.js';
import { CoreModule } from '@/core/CoreModule.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { IdService } from '@/core/IdService.js';
import { UserQuoteMutingService } from '@/core/UserQuoteMutingService.js';
import {
	QuoteMutingsRepository,
	UsersRepository,
	UserProfilesRepository,
	MiUser,
	MiQuoteMuting,
} from '@/models/_.js';
import { DI } from '@/di-symbols.js';

describe('UserQuoteMutingService', () => {
	let app: TestingModule;
	let service: UserQuoteMutingService;
	let repository: QuoteMutingsRepository;
	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;
	let idService: IdService;

	let alice: MiUser;
	let bob: MiUser;

	async function createUser(data: Partial<MiUser> = {}) {
		const user = await usersRepository
			.insert({
				id: idService.gen(),
				username: 'username',
				usernameLower: 'username',
				...data,
			})
			.then(x => usersRepository.findOneByOrFail(x.identifiers[0]));

		await userProfilesRepository.insert({
			userId: user.id,
		});

		return user;
	}

	beforeAll(async () => {
		app = await Test.createTestingModule({
			imports: [
				GlobalModule,
				CoreModule,
			],
			providers: [
				GlobalEventService,
				IdService,
				UserQuoteMutingService,
			],
		}).compile();

		app.enableShutdownHooks();

		service = app.get<UserQuoteMutingService>(UserQuoteMutingService);
		idService = app.get<IdService>(IdService);
		repository = app.get<QuoteMutingsRepository>(DI.quoteMutingsRepository);
		usersRepository = app.get<UsersRepository>(DI.usersRepository);
		userProfilesRepository = app.get<UserProfilesRepository>(DI.userProfilesRepository);
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(async () => {
		alice = await createUser({ username: 'alice' });
		bob = await createUser({ username: 'bob' });
	});

	afterEach(async () => {
		await repository.deleteAll();
		await userProfilesRepository.deleteAll();
		await usersRepository.deleteAll();
	});

	test('mute persists expiresAt', async () => {
		const future = new Date(Date.now() + 60_000);
		await service.mute(alice, bob, future);

		const rows = await repository.find({ where: { muterId: alice.id, muteeId: bob.id } });
		expect(rows).toHaveLength(1);
		expect(rows[0].expiresAt).not.toBeNull();
		expect(rows[0].expiresAt!.getTime()).toBeCloseTo(future.getTime(), -2);
	});

	test('mute with null expiresAt stores null', async () => {
		await service.mute(alice, bob, null);

		const rows = await repository.find({ where: { muterId: alice.id, muteeId: bob.id } });
		expect(rows).toHaveLength(1);
		expect(rows[0].expiresAt).toBeNull();
	});

	test('unmute removes rows', async () => {
		await service.mute(alice, bob, null);
		const rows = await repository.find({ where: { muterId: alice.id, muteeId: bob.id } });
		expect(rows).toHaveLength(1);

		await service.unmute(rows);
		const after = await repository.find({ where: { muterId: alice.id, muteeId: bob.id } });
		expect(after).toHaveLength(0);
	});
});
