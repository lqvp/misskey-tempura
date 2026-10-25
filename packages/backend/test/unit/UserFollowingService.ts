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
import { NotificationService } from '@/core/NotificationService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { RoleService } from '@/core/RoleService.js';
import { CacheService } from '@/core/CacheService.js';
import { UserWebhookService } from '@/core/UserWebhookService.js';

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

describe('unfollow の silent 指定', () => {
	let service: UserFollowingService;
	let notificationService: NotificationService;
	let globalEventService: GlobalEventService;
	const followings = mockDeep<FollowingsRepository>();
	const users = mockDeep<UsersRepository>();
	const userEntity = mockDeep<UserEntityService>();
	const roleService = mockDeep<RoleService>();
	const cacheService = mockDeep<CacheService>();
	const webhookService = mockDeep<UserWebhookService>();
	// follower(削除される側)はremote、followee(通知される側)はlocal
	const follower = { id: 'deleted-remote', host: 'example.com', uri: 'https://example.com/users/x', inbox: 'https://example.com/inbox', sharedInbox: null };
	const followee = { id: 'local-user', host: null, uri: null, inbox: null, sharedInbox: null };

	beforeEach(async () => {
		[followings, users, userEntity, roleService, cacheService, webhookService].forEach(m => mockReset(m));
		const module = await Test.createTestingModule({
			providers: [
				UserFollowingService,
				{ provide: DI.followingsRepository, useValue: followings },
				{ provide: DI.usersRepository, useValue: users },
				{ provide: UserEntityService, useValue: userEntity },
				{ provide: RoleService, useValue: roleService },
				{ provide: CacheService, useValue: cacheService },
				{ provide: UserWebhookService, useValue: webhookService },
			],
		}).useMocker(() => mockDeep()).compile();
		service = module.get(UserFollowingService);
		notificationService = module.get(NotificationService);
		globalEventService = module.get(GlobalEventService);
		// インスタンス統計の分岐(連合インスタンスへの非同期処理)は本テストの対象外なので無効化する
		(module.get(DI.meta) as any).enableStatsForFederatedInstances = false;

		followings.findOne.mockResolvedValue({ id: 'rel1', follower, followee } as any);
		userEntity.isLocalUser.mockImplementation(u => u.host == null);
		userEntity.isRemoteUser.mockImplementation(u => u.host != null);
		userEntity.pack.mockResolvedValue({} as any);
		roleService.getUserPolicies.mockResolvedValue({ canUseUnFollowNotification: true } as any);
		cacheService.userFollowingsCache.refresh.mockResolvedValue(undefined as any);
		webhookService.getActiveWebhooks.mockResolvedValue([] as any);
	});

	test('silent=true では followee への通知・stream・webhook を発行しない', async () => {
		await service.unfollow(follower as any, followee as any, true, true);
		// floatingな pack().then() 内の配信も確定させてから検証する
		await new Promise(resolve => setImmediate(resolve));

		expect(notificationService.createNotification).not.toHaveBeenCalled();
		expect(globalEventService.publishMainStream).not.toHaveBeenCalled();
	});

	test('silent=false では followee へ unfollow 通知を作成する', async () => {
		await service.unfollow(follower as any, followee as any, false, true);

		expect(notificationService.createNotification).toHaveBeenCalledWith('local-user', 'unfollow', {}, 'deleted-remote');
	});

	test('silent=true ではロールポリシー照会自体をスキップする (一括処理のDB負荷を避ける)', async () => {
		await service.unfollow(follower as any, followee as any, true, true);

		expect(roleService.getUserPolicies).not.toHaveBeenCalled();
	});

	test('ポリシー不許可でも通知を作らないだけで unfollow 履歴は記録する', async () => {
		roleService.getUserPolicies.mockResolvedValue({ canUseUnFollowNotification: false } as any);
		const historyService = (service as any).historyService;

		await service.unfollow(follower as any, followee as any, false, true);

		expect(notificationService.createNotification).not.toHaveBeenCalled();
		expect(historyService.addUnfollowHistory).toHaveBeenCalledWith(follower, followee);
	});
});
