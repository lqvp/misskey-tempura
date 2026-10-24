/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import type { FollowingsRepository, FollowRequestsRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { IdService } from '@/core/IdService.js';
import { EntityNotFoundError } from 'typeorm';
import { IdentifiableError } from '@/misc/identifiable-error.js';

describe('鍵解除時のフォローリクエスト承認', () => {
	let service: UserFollowingService;
	const users = mockDeep<UsersRepository>();
	const profiles = mockDeep<UserProfilesRepository>();
	const requests = mockDeep<FollowRequestsRepository>();
	const followings = mockDeep<FollowingsRepository>();
	const userEntity = mockDeep<UserEntityService>();
	const idService = mockDeep<IdService>();
	const receiver = { id: 'receiver', host: null, uri: null, inbox: null, sharedInbox: null };
	const follower = { id: 'follower', host: null } as MiUser;
	const unexpectedError = new Error('DB error');
	const createdAt = new Date();

	beforeEach(async () => {
		mockReset(users);
		mockReset(profiles);
		mockReset(requests);
		mockReset(followings);
		mockReset(userEntity);
		mockReset(idService);
		const module = await Test.createTestingModule({
			providers: [
				UserFollowingService,
				{ provide: DI.usersRepository, useValue: users },
				{ provide: DI.userProfilesRepository, useValue: profiles },
				{ provide: DI.followRequestsRepository, useValue: requests },
				{ provide: DI.followingsRepository, useValue: followings },
				{ provide: UserEntityService, useValue: userEntity },
				{ provide: IdService, useValue: idService },
			],
		}).useMocker(() => mockDeep()).compile();
		service = module.get(UserFollowingService);
		requests.find.mockResolvedValue([
			{ followerId: 'first', follower }, { followerId: 'second', follower },
		] as Awaited<ReturnType<FollowRequestsRepository['find']>>);
		profiles.findOneByOrFail.mockResolvedValue({} as Awaited<ReturnType<UserProfilesRepository['findOneByOrFail']>>);
		userEntity.isRemoteUser.mockReturnValue(false);
		idService.parse.mockReturnValue({ date: createdAt } as ReturnType<IdService['parse']>);
	});

	test('処理中に削除された相手をスキップし、残りのリクエストを処理する', async () => {
		requests.find.mockResolvedValue([
			{ followerId: 'first', follower: null }, { followerId: 'second', follower },
		] as Awaited<ReturnType<FollowRequestsRepository['find']>>);
		requests.findOneBy.mockRejectedValue(unexpectedError);
		await expect(service.acceptAllFollowRequests(receiver)).rejects.toBe(unexpectedError);
	});

	test('処理中に取り消されたリクエストをスキップし、残りの想定外エラーは伝播する', async () => {
		requests.findOneBy.mockResolvedValueOnce(null).mockRejectedValueOnce(unexpectedError);
		await expect(service.acceptAllFollowRequests(receiver)).rejects.toBe(unexpectedError);
	});

	test.each([false, true])('複数の申請者とフォロー済みの相手を一括取得し、自動承認の対象だけを承認する（リモート: %s）', async remote => {
		const host = remote ? 'example.com' : null;
		const followed = { id: 'first', host } as MiUser;
		const pending = { id: 'second', host } as MiUser;
		requests.find.mockResolvedValue([
			{ followerId: followed.id, follower: followed }, { followerId: pending.id, follower: pending },
		] as Awaited<ReturnType<FollowRequestsRepository['find']>>);
		profiles.findOneByOrFail.mockResolvedValue({
			followApprovalLocalSeconds: remote ? 0 : 43200,
			followApprovalRemoteSeconds: remote ? 43200 : 0,
			autoAcceptFollowed: true,
		} as Awaited<ReturnType<UserProfilesRepository['findOneByOrFail']>>);
		userEntity.isRemoteUser.mockReturnValue(remote);
		followings.find.mockResolvedValue([{ followeeId: followed.id }] as Awaited<ReturnType<FollowingsRepository['find']>>);
		const accept = vi.spyOn(service, 'acceptFollowRequest').mockResolvedValue();

		await service.acceptAllFollowRequests(receiver);

		expect(accept).toHaveBeenCalledExactlyOnceWith(receiver, followed);
		expect(requests.find).toHaveBeenCalledTimes(1);
		expect(followings.find).toHaveBeenCalledTimes(1);
		expect(followings.exists).not.toHaveBeenCalled();
		expect(users.findOneBy).not.toHaveBeenCalled();
	});
});

describe('鍵解除時のフォローリクエスト拒否', () => {
	let service: UserFollowingService;
	const users = mockDeep<UsersRepository>();
	const requests = mockDeep<FollowRequestsRepository>();
	const receiver = { id: 'receiver', host: null, uri: null, inbox: null, sharedInbox: null };

	beforeEach(async () => {
		mockReset(users);
		mockReset(requests);
		const module = await Test.createTestingModule({
			providers: [
				UserFollowingService,
				{ provide: DI.usersRepository, useValue: users },
				{ provide: DI.followRequestsRepository, useValue: requests },
			],
		}).useMocker(() => mockDeep()).compile();
		service = module.get(UserFollowingService);
		requests.findBy.mockResolvedValue([
			{ followerId: 'first' }, { followerId: 'second' }, { followerId: 'third' },
		] as Awaited<ReturnType<FollowRequestsRepository['findBy']>>);
		users.findOneByOrFail.mockImplementation((async ({ id }: { id: string }) => ({ id, host: null })) as never);
	});

	test('1件の拒否が想定外のエラーで失敗しても、残りのリクエストの拒否を続ける', async () => {
		const reject = vi.spyOn(service, 'rejectFollowRequest')
			.mockRejectedValueOnce(new Error('DB error'))
			.mockResolvedValue();

		await expect(service.rejectAllFollowRequests(receiver)).resolves.toBeUndefined();

		expect(reject.mock.calls.map(([, follower]) => follower.id)).toEqual(['first', 'second', 'third']);
	});

	test('取り消されたリクエストや削除された相手はスキップし、残りを拒否する', async () => {
		users.findOneByOrFail.mockImplementation((async ({ id }: { id: string }) => {
			if (id === 'first') throw new EntityNotFoundError('MiUser', { id });
			return { id, host: null };
		}) as never);
		const reject = vi.spyOn(service, 'rejectFollowRequest')
			.mockRejectedValueOnce(new IdentifiableError('8884c2dd-5795-4ac9-b27e-6a01d38190f9', 'canceled'))
			.mockResolvedValue();

		await expect(service.rejectAllFollowRequests(receiver)).resolves.toBeUndefined();

		expect(reject.mock.calls.map(([, follower]) => follower.id)).toEqual(['second', 'third']);
	});
});
