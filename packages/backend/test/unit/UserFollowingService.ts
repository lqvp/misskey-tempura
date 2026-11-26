/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import type { FollowingsRepository, FollowRequestsRepository, MiFollowRequest, MiMeta, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import type { MiLocalUser, MiRemoteUser } from '@/models/User.js';
import { MiUser } from '@/models/User.js';
import { MiFollowing } from '@/models/Following.js';
import type { Config } from '@/config.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { IdService } from '@/core/IdService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { QueueService } from '@/core/QueueService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { CacheService } from '@/core/CacheService.js';
import { RoleService } from '@/core/RoleService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { UserWebhookService } from '@/core/UserWebhookService.js';
import { HistoryService } from '@/core/HistoryService.js';
import PerUserFollowingChart from '@/core/chart/charts/per-user-following.js';
import type { UserBlockingService } from '@/core/UserBlockingService.js';
import type { DeepMockProxy } from 'vitest-mock-extended';
import type { DataSource, EntityManager } from 'typeorm';

function setupTransactionMock(
	db: DeepMockProxy<DataSource>,
	txFollowings: FollowingsRepository,
	txUsers: UsersRepository,
	onRejected?: (err: unknown) => void,
) {
	const em = mockDeep<EntityManager>();
	em.getRepository.mockImplementation(((entity: unknown) => {
		if (entity === MiFollowing) return txFollowings;
		if (entity === MiUser) return txUsers;
		throw new Error(`Unexpected repository entity: ${String(entity)}`);
	}) as never);
	db.transaction.mockImplementation((async (
		runInTransaction: ((entityManager: EntityManager) => Promise<unknown>) | unknown,
		maybeRunInTransaction?: (entityManager: EntityManager) => Promise<unknown>,
	) => {
		const callback = typeof runInTransaction === 'function' ? runInTransaction : maybeRunInTransaction;
		if (typeof callback !== 'function') {
			throw new Error('Expected transaction callback');
		}
		try {
			return await callback(em);
		} catch (err) {
			onRejected?.(err);
			throw err;
		}
	}) as never);
	return em;
}

describe('鍵解除時のフォローリクエスト承認', () => {
	let service: UserFollowingService;
	const db = mockDeep<DataSource>();
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
		mockReset(db);
		mockReset(users);
		mockReset(profiles);
		mockReset(requests);
		mockReset(followings);
		mockReset(userEntity);
		mockReset(idService);
		setupTransactionMock(db, followings, users);
		const module = await Test.createTestingModule({
			providers: [
				UserFollowingService,
				{ provide: DI.db, useValue: db },
				{ provide: DI.usersRepository, useValue: users },
				{ provide: DI.userProfilesRepository, useValue: profiles },
				{ provide: DI.followRequestsRepository, useValue: requests },
				{ provide: DI.followingsRepository, useValue: followings as unknown }, // 型推論が TS2590 (union type too complex) になるため unknown にする
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

describe('Undo / Reject が元の Follow アクティビティの ID を参照する', () => {
	const LOCAL_URL = 'https://local.example';
	const REMOTE_FOLLOW_ID = 'https://remote.example/follows/1';

	let service: UserFollowingService;
	const db = mockDeep<DataSource>();
	const users = mockDeep<UsersRepository>();
	const requests = mockDeep<FollowRequestsRepository>();
	const followings = mockDeep<FollowingsRepository>();
	const userEntity = mockDeep<UserEntityService>();
	const utility = mockDeep<UtilityService>();
	const queue = mockDeep<QueueService>();
	const cache = mockDeep<CacheService>();
	const role = mockDeep<RoleService>();
	const blocking = mockDeep<UserBlockingService>();

	const localUser = {
		id: 'local', host: null, uri: null, inbox: null, sharedInbox: null, movedToUri: null,
	} as MiLocalUser;
	const remoteUser = {
		id: 'remote', host: 'remote.example', uri: 'https://remote.example/users/remote', inbox: 'https://remote.example/inbox', sharedInbox: null, movedToUri: null,
	} as MiRemoteUser;

	/** 最後に配送されたアクティビティ */
	function lastDelivered() {
		const content = queue.deliver.mock.lastCall?.[1];
		return content as unknown as { type: string; id?: string; object: { type: string; id?: string } } | undefined;
	}

	beforeEach(async () => {
		mockReset(db);
		mockReset(users);
		mockReset(requests);
		mockReset(followings);
		mockReset(userEntity);
		mockReset(utility);
		mockReset(queue);
		mockReset(cache);
		mockReset(role);
		mockReset(blocking);
		setupTransactionMock(db, followings, users);

		const module = await Test.createTestingModule({
			providers: [
				UserFollowingService,
				ApRendererService,
				{ provide: DI.db, useValue: db },
				{ provide: DI.config, useValue: { url: LOCAL_URL } as Config },
				{ provide: DI.meta, useValue: { enableStatsForFederatedInstances: false, forciblyFollowedUsers: [] as string[] } as MiMeta },
				{ provide: DI.usersRepository, useValue: users },
				{ provide: DI.followRequestsRepository, useValue: requests },
				{ provide: DI.followingsRepository, useValue: followings as unknown }, // 型推論が TS2590 (union type too complex) になるため unknown にする
				{ provide: UserEntityService, useValue: userEntity },
				{ provide: UtilityService, useValue: utility },
				{ provide: QueueService, useValue: queue },
				{ provide: CacheService, useValue: cache },
				{ provide: RoleService, useValue: role },
				{ provide: 'UserBlockingService', useValue: blocking },
			],
		}).useMocker(() => mockDeep()).compile();
		service = module.get(UserFollowingService);
		service.onModuleInit();

		userEntity.isLocalUser.mockImplementation(((user: { host: string | null }) => user.host == null) as never);
		userEntity.isRemoteUser.mockImplementation(((user: { host: string | null }) => user.host != null) as never);
		userEntity.genLocalUserUri.mockImplementation(id => `${LOCAL_URL}/users/${id}`);
		userEntity.getUserUri.mockImplementation(user => user.host == null ? `${LOCAL_URL}/users/${user.id}` : user.uri);
		userEntity.pack.mockResolvedValue({} as never);
		utility.isUriLocal.mockImplementation(uri => uri.startsWith(`${LOCAL_URL}/`));
		users.findOneByOrFail.mockResolvedValue({ movedToUri: null } as MiUser);
		followings.insert.mockResolvedValue({} as never);
		cache.userProfileCache.fetch.mockResolvedValue({ followedMessage: null } as never);
		role.getUserPolicies.mockResolvedValue({ canAutoFollowBack: false, canUseUnFollowNotification: false } as never);
		role.isModerator.mockResolvedValue(false);
	});

	describe('フォロー関係の成立', () => {
		test('ローカル → リモートのフォローリクエストが承認されたとき、送信した Follow の ID を保存する', async () => {
			requests.findOneBy.mockResolvedValue({ id: 'req1', requestId: null, withReplies: false } as MiFollowRequest);

			await service.acceptFollowRequest(remoteUser, localUser);

			expect(followings.insert).toHaveBeenCalledWith(expect.objectContaining({ requestId: `${LOCAL_URL}/follows/req1` }));
		});

		test('リモート → ローカルのフォローリクエストを承認したとき、受信した Follow の ID を保存する', async () => {
			requests.findOneBy.mockResolvedValue({ id: 'req1', requestId: REMOTE_FOLLOW_ID, withReplies: false } as MiFollowRequest);

			await service.acceptFollowRequest(localUser, remoteUser);

			expect(followings.insert).toHaveBeenCalledWith(expect.objectContaining({ requestId: REMOTE_FOLLOW_ID }));
		});

		test('フォロー済みのリモートユーザーから再度 Follow を受け取ったとき、保存する Follow の ID を更新する', async () => {
			const newFollowId = 'https://remote.example/follows/2';
			users.findOneByOrFail.mockResolvedValueOnce(remoteUser).mockResolvedValueOnce(localUser);
			blocking.checkBlocked.mockResolvedValue(false);
			followings.exists.mockResolvedValue(true);

			await service.follow(remoteUser, localUser, { requestId: newFollowId });

			expect(followings.update).toHaveBeenCalledWith({ followerId: remoteUser.id, followeeId: localUser.id }, { requestId: newFollowId });
			expect(lastDelivered()?.type).toBe('Accept');
			expect(lastDelivered()?.object.id).toBe(newFollowId);
		});
	});

	describe('フォロー解除', () => {
		test('リモートユーザーのフォローを解除したときの Undo は、送信した Follow の ID を参照する', async () => {
			followings.findOne.mockResolvedValue({
				id: 'following1', follower: localUser, followee: remoteUser, requestId: `${LOCAL_URL}/follows/req1`,
			} as MiFollowing);

			await service.unfollow(localUser, remoteUser);

			expect(lastDelivered()?.type).toBe('Undo');
			expect(lastDelivered()?.object.id).toBe(`${LOCAL_URL}/follows/req1`);
			// Undo 自体の ID もフォローごとに一意になる
			expect(lastDelivered()?.id).toBe(`${LOCAL_URL}/follows/req1/undo`);
		});

		test('Follow の ID が保存されていないフォロー関係では、従来の ID にフォールバックする', async () => {
			followings.findOne.mockResolvedValue({
				id: 'following1', follower: localUser, followee: remoteUser, requestId: null,
			} as MiFollowing);

			await service.unfollow(localUser, remoteUser);

			expect(lastDelivered()?.type).toBe('Undo');
			expect(lastDelivered()?.object.id).toBe(`${LOCAL_URL}/follows/${localUser.id}/${remoteUser.id}`);
		});

		test('リモートユーザーからのフォロー関係を解除したときの Reject は、受信した Follow の ID を参照する', async () => {
			followings.findOne.mockResolvedValue({
				id: 'following1', follower: remoteUser, followee: localUser, requestId: REMOTE_FOLLOW_ID,
			} as MiFollowing);

			await service.unfollow(remoteUser, localUser);

			expect(lastDelivered()?.type).toBe('Reject');
			expect(lastDelivered()?.object.id).toBe(REMOTE_FOLLOW_ID);
		});
	});

	test('フォローリクエストを取り消したときの Undo は、送信した Follow の ID を参照する', async () => {
		requests.findOneBy.mockResolvedValue({ id: 'req1', requestId: null } as MiFollowRequest);

		await service.cancelFollowRequest(remoteUser, localUser);

		expect(lastDelivered()?.type).toBe('Undo');
		expect(lastDelivered()?.object.id).toBe(`${LOCAL_URL}/follows/req1`);
	});

	test('フォロワーを解除したときの Reject は、受信した Follow の ID を参照する', async () => {
		requests.findOneBy.mockResolvedValue(null);
		followings.findOneBy.mockResolvedValue({ requestId: REMOTE_FOLLOW_ID } as MiFollowing);
		followings.findOne.mockResolvedValue({
			id: 'following1', follower: remoteUser, followee: localUser, requestId: REMOTE_FOLLOW_ID,
		} as MiFollowing);

		await service.rejectFollow(localUser, remoteUser);

		// Reject の配送は await されないため、配送されるまで待つ
		await vi.waitFor(() => expect(queue.deliver).toHaveBeenCalled());
		expect(lastDelivered()?.type).toBe('Reject');
		expect(lastDelivered()?.object.id).toBe(REMOTE_FOLLOW_ID);
	});
});

describe('フォロー解除時のカウント減算完了を待機する', () => {
	type DecrementResult = Awaited<ReturnType<UsersRepository['decrement']>>;

	let service: UserFollowingService;
	const db = mockDeep<DataSource>();
	const users = mockDeep<UsersRepository>();
	const followings = mockDeep<FollowingsRepository>();
	const userEntity = mockDeep<UserEntityService>();
	const role = mockDeep<RoleService>();
	const blocking = mockDeep<UserBlockingService>();

	const follower = {
		id: 'follower', host: null, uri: null, inbox: null, sharedInbox: null, movedToUri: null,
	} as MiLocalUser;
	const followee = {
		id: 'followee', host: null, uri: null, inbox: null, sharedInbox: null, movedToUri: null,
	} as MiLocalUser;

	beforeEach(async () => {
		mockReset(db);
		mockReset(users);
		mockReset(followings);
		mockReset(userEntity);
		mockReset(role);
		mockReset(blocking);
		setupTransactionMock(db, followings, users);

		const module = await Test.createTestingModule({
			providers: [
				UserFollowingService,
				{ provide: DI.db, useValue: db },
				{ provide: DI.meta, useValue: { enableStatsForFederatedInstances: false, forciblyFollowedUsers: [] as string[] } as MiMeta },
				{ provide: DI.usersRepository, useValue: users },
				{ provide: DI.followingsRepository, useValue: followings as unknown }, // 型推論が TS2590 (union type too complex) になるため unknown にする
				{ provide: UserEntityService, useValue: userEntity },
				{ provide: RoleService, useValue: role },
				{ provide: 'UserBlockingService', useValue: blocking },
			],
		}).useMocker(() => mockDeep()).compile();
		service = module.get(UserFollowingService);
		service.onModuleInit();

		userEntity.isLocalUser.mockImplementation(((user: { host: string | null }) => user.host == null) as never);
		userEntity.isRemoteUser.mockImplementation(((user: { host: string | null }) => user.host != null) as never);
		userEntity.pack.mockResolvedValue({} as never);
		role.getUserPolicies.mockResolvedValue({ canUseUnFollowNotification: false } as never);
		role.isModerator.mockResolvedValue(false);
		followings.findOne.mockResolvedValue({
			id: 'following1', follower, followee, requestId: null,
		} as MiFollowing);
	});

	function createDeferredDecrements() {
		const followingDecrement = Promise.withResolvers<DecrementResult>();
		const followersDecrement = Promise.withResolvers<DecrementResult>();

		users.decrement.mockImplementation((_criteria, propertyPath) => {
			if (propertyPath === 'followingCount') return followingDecrement.promise;
			if (propertyPath === 'followersCount') return followersDecrement.promise;
			throw new Error(`Unexpected decrement property: ${String(propertyPath)}`);
		});

		return { followingDecrement, followersDecrement };
	}

	test('unfollow は followingCount と followersCount の減算が完了するまで解決しない', async () => {
		const { followingDecrement, followersDecrement } = createDeferredDecrements();

		let settled = false;
		const unfollowPromise = service.unfollow(follower, followee).then(() => {
			settled = true;
		});

		// デッドロック防止のため ID 昇順 ('followee' -> 'follower') で順次更新される
		await vi.waitFor(() => {
			expect(users.decrement).toHaveBeenCalledTimes(1);
		});
		expect(users.decrement).toHaveBeenNthCalledWith(1, { id: followee.id }, 'followersCount', 1);
		await new Promise<void>(resolve => setImmediate(resolve));
		expect(settled).toBe(false);

		followersDecrement.resolve({} as DecrementResult);
		await vi.waitFor(() => {
			expect(users.decrement).toHaveBeenCalledTimes(2);
		});
		expect(users.decrement).toHaveBeenNthCalledWith(2, { id: follower.id }, 'followingCount', 1);
		await new Promise<void>(resolve => setImmediate(resolve));
		expect(settled).toBe(false);

		followingDecrement.resolve({} as DecrementResult);
		await unfollowPromise;
		expect(settled).toBe(true);
	});

	test('rejectFollow は followingCount と followersCount の減算が完了するまで解決しない', async () => {
		const { followingDecrement, followersDecrement } = createDeferredDecrements();

		let settled = false;
		const rejectPromise = service.rejectFollow(followee, follower).then(() => {
			settled = true;
		});

		await vi.waitFor(() => {
			expect(users.decrement).toHaveBeenCalledTimes(1);
		});
		expect(users.decrement).toHaveBeenNthCalledWith(1, { id: followee.id }, 'followersCount', 1);
		await new Promise<void>(resolve => setImmediate(resolve));
		expect(settled).toBe(false);

		followersDecrement.resolve({} as DecrementResult);
		await vi.waitFor(() => {
			expect(users.decrement).toHaveBeenCalledTimes(2);
		});
		expect(users.decrement).toHaveBeenNthCalledWith(2, { id: follower.id }, 'followingCount', 1);
		await new Promise<void>(resolve => setImmediate(resolve));
		expect(settled).toBe(false);

		followingDecrement.resolve({} as DecrementResult);
		await rejectPromise;
		expect(settled).toBe(true);
	});

	test('unfollow はカウント減算で発生したエラーを伝播する', async () => {
		const dbError = new Error('decrement failed');
		users.decrement.mockRejectedValue(dbError);

		await expect(service.unfollow(follower, followee)).rejects.toBe(dbError);
	});

	test('rejectFollow はカウント減算で発生したエラーを伝播する', async () => {
		const dbError = new Error('decrement failed');
		users.decrement.mockRejectedValue(dbError);

		await expect(service.rejectFollow(followee, follower)).rejects.toBe(dbError);
	});
});

describe('フォロー解除・フォロワー解除のトランザクション境界', () => {
	const LOCAL_URL = 'https://local.example';

	let service: UserFollowingService;
	let txCallbackError: unknown;
	const db = mockDeep<DataSource>();
	const users = mockDeep<UsersRepository>();
	const followings = mockDeep<FollowingsRepository>();
	const txUsers = mockDeep<UsersRepository>();
	const txFollowings = mockDeep<FollowingsRepository>();
	const userEntity = mockDeep<UserEntityService>();
	const utility = mockDeep<UtilityService>();
	const queue = mockDeep<QueueService>();
	const cache = mockDeep<CacheService>();
	const role = mockDeep<RoleService>();
	const globalEvent = mockDeep<GlobalEventService>();
	const webhook = mockDeep<UserWebhookService>();
	const history = mockDeep<HistoryService>();
	const perUserFollowingChart = mockDeep<PerUserFollowingChart>();
	const blocking = mockDeep<UserBlockingService>();

	const localFollower = {
		id: 'local-follower', host: null, uri: null, inbox: null, sharedInbox: null, movedToUri: null,
	} as MiLocalUser;
	const localFollowee = {
		id: 'local-followee', host: null, uri: null, inbox: null, sharedInbox: null, movedToUri: null,
	} as MiLocalUser;
	const remoteFollowee = {
		id: 'remote-followee', host: 'remote.example', uri: 'https://remote.example/users/remote', inbox: 'https://remote.example/inbox', sharedInbox: null, movedToUri: null,
	} as MiRemoteUser;

	beforeEach(async () => {
		txCallbackError = undefined;
		mockReset(db);
		mockReset(users);
		mockReset(followings);
		mockReset(txUsers);
		mockReset(txFollowings);
		mockReset(userEntity);
		mockReset(utility);
		mockReset(queue);
		mockReset(cache);
		mockReset(role);
		mockReset(globalEvent);
		mockReset(webhook);
		mockReset(history);
		mockReset(perUserFollowingChart);
		mockReset(blocking);

		setupTransactionMock(db, txFollowings, txUsers, err => {
			txCallbackError = err;
		});

		const module = await Test.createTestingModule({
			providers: [
				UserFollowingService,
				ApRendererService,
				{ provide: DI.db, useValue: db },
				{ provide: DI.config, useValue: { url: LOCAL_URL } as Config },
				{ provide: DI.meta, useValue: { enableStatsForFederatedInstances: false, forciblyFollowedUsers: [] as string[] } as MiMeta },
				{ provide: DI.usersRepository, useValue: users },
				{ provide: DI.followingsRepository, useValue: followings as unknown }, // 型推論が TS2590 (union type too complex) になるため unknown にする
				{ provide: UserEntityService, useValue: userEntity },
				{ provide: UtilityService, useValue: utility },
				{ provide: QueueService, useValue: queue },
				{ provide: CacheService, useValue: cache },
				{ provide: RoleService, useValue: role },
				{ provide: GlobalEventService, useValue: globalEvent },
				{ provide: UserWebhookService, useValue: webhook },
				{ provide: HistoryService, useValue: history },
				{ provide: PerUserFollowingChart, useValue: perUserFollowingChart },
				{ provide: 'UserBlockingService', useValue: blocking },
			],
		}).useMocker(() => mockDeep()).compile();
		service = module.get(UserFollowingService);
		service.onModuleInit();

		userEntity.isLocalUser.mockImplementation(((user: { host: string | null }) => user.host == null) as never);
		userEntity.isRemoteUser.mockImplementation(((user: { host: string | null }) => user.host != null) as never);
		userEntity.genLocalUserUri.mockImplementation(id => `${LOCAL_URL}/users/${id}`);
		userEntity.getUserUri.mockImplementation(user => user.host == null ? `${LOCAL_URL}/users/${user.id}` : user.uri);
		userEntity.pack.mockResolvedValue({} as never);
		utility.isUriLocal.mockImplementation(uri => uri.startsWith(`${LOCAL_URL}/`));
		role.getUserPolicies.mockResolvedValue({ canUseUnFollowNotification: false } as never);
		role.isModerator.mockResolvedValue(false);
		txFollowings.delete.mockResolvedValue({ affected: 1, raw: [] });
	});

	test('unfollow は following の削除とカウント減算を db.transaction の EntityManager 経由で実行する', async () => {
		followings.findOne.mockResolvedValue({
			id: 'following1', follower: localFollower, followee: remoteFollowee, requestId: `${LOCAL_URL}/follows/req1`,
		} as MiFollowing);

		await service.unfollow(localFollower, remoteFollowee);

		expect(db.transaction).toHaveBeenCalledTimes(1);
		expect(txFollowings.delete).toHaveBeenCalledExactlyOnceWith('following1');
		expect(txUsers.decrement).toHaveBeenCalledWith({ id: localFollower.id }, 'followingCount', 1);
		expect(txUsers.decrement).toHaveBeenCalledWith({ id: remoteFollowee.id }, 'followersCount', 1);
		// トランザクション外の Repository を直接呼ばないこと
		expect(followings.delete).not.toHaveBeenCalled();
		expect(users.decrement).not.toHaveBeenCalled();
		// コミット後の副作用は実行されること
		expect(cache.userFollowingsCache.refresh).toHaveBeenCalledExactlyOnceWith(localFollower.id);
		expect(globalEvent.publishInternalEvent).toHaveBeenCalledExactlyOnceWith('unfollow', {
			followerId: localFollower.id,
			followeeId: remoteFollowee.id,
		});
		expect(perUserFollowingChart.update).toHaveBeenCalledExactlyOnceWith(localFollower, remoteFollowee, false);
		expect(queue.deliver).toHaveBeenCalledTimes(1);
		expect(history.addUnfollowHistory).toHaveBeenCalledExactlyOnceWith(localFollower, remoteFollowee);
	});

	test('unfollow は移行済みユーザーを含む場合もカウント再計算を db.transaction の EntityManager 経由で実行する', async () => {
		const movedRemoteFollowee = {
			...remoteFollowee,
			movedToUri: 'https://moved.example/users/remote',
		} as MiRemoteUser;
		followings.findOne.mockResolvedValue({
			id: 'following1', follower: localFollower, followee: movedRemoteFollowee, requestId: null,
		} as MiFollowing);
		txFollowings.count.mockResolvedValueOnce(3).mockResolvedValueOnce(5);

		await service.unfollow(localFollower, movedRemoteFollowee);

		expect(db.transaction).toHaveBeenCalledTimes(1);
		expect(txFollowings.delete).toHaveBeenCalledExactlyOnceWith('following1');
		expect(txFollowings.count).toHaveBeenCalledTimes(2);
		expect(txUsers.update).toHaveBeenCalledExactlyOnceWith(
			{ id: localFollower.id },
			{ followingCount: 3, followersCount: 5 },
		);
		expect(followings.delete).not.toHaveBeenCalled();
		expect(followings.count).not.toHaveBeenCalled();
		expect(users.update).not.toHaveBeenCalled();
	});

	test('リモートユーザーの unfollow でカウント減算が失敗したとき、トランザクションが reject し副作用・Undo 配送を行わない', async () => {
		const dbError = new Error('decrement timeout');
		followings.findOne.mockResolvedValue({
			id: 'following1', follower: localFollower, followee: remoteFollowee, requestId: `${LOCAL_URL}/follows/req1`,
		} as MiFollowing);
		txUsers.decrement.mockRejectedValue(dbError);

		await expect(service.unfollow(localFollower, remoteFollowee)).rejects.toBe(dbError);

		expect(db.transaction).toHaveBeenCalledTimes(1);
		expect(txCallbackError).toBe(dbError);
		expect(txFollowings.delete).toHaveBeenCalledExactlyOnceWith('following1');
		expect(followings.delete).not.toHaveBeenCalled();
		expect(cache.userFollowingsCache.refresh).not.toHaveBeenCalled();
		expect(globalEvent.publishInternalEvent).not.toHaveBeenCalled();
		expect(globalEvent.publishMainStream).not.toHaveBeenCalled();
		expect(webhook.enqueueUserWebhook).not.toHaveBeenCalled();
		expect(queue.deliver).not.toHaveBeenCalled();
		expect(perUserFollowingChart.update).not.toHaveBeenCalled();
		expect(history.addUnfollowHistory).not.toHaveBeenCalled();
	});

	test('並行 unfollow により delete の affected が 0 のとき、カウント減算や重複する Undo 配送・イベント発行を行わない', async () => {
		followings.findOne.mockResolvedValue({
			id: 'following1', follower: localFollower, followee: remoteFollowee, requestId: `${LOCAL_URL}/follows/req1`,
		} as MiFollowing);
		txFollowings.delete.mockResolvedValue({ affected: 0, raw: [] });

		await service.unfollow(localFollower, remoteFollowee);

		expect(db.transaction).toHaveBeenCalledTimes(1);
		expect(txFollowings.delete).toHaveBeenCalledExactlyOnceWith('following1');
		expect(txUsers.decrement).not.toHaveBeenCalled();
		expect(txUsers.update).not.toHaveBeenCalled();
		expect(cache.userFollowingsCache.refresh).not.toHaveBeenCalled();
		expect(globalEvent.publishInternalEvent).not.toHaveBeenCalled();
		expect(globalEvent.publishMainStream).not.toHaveBeenCalled();
		expect(webhook.enqueueUserWebhook).not.toHaveBeenCalled();
		expect(queue.deliver).not.toHaveBeenCalled();
		expect(perUserFollowingChart.update).not.toHaveBeenCalled();
		expect(history.addUnfollowHistory).not.toHaveBeenCalled();
	});

	test('rejectFollow (removeFollow) でカウント減算が失敗したとき、トランザクションが reject し内部 unfollow イベントやローカル publishUnfollow を行わない', async () => {
		const dbError = new Error('decrement timeout');
		followings.findOne.mockResolvedValue({
			id: 'following1', follower: localFollower, followee: localFollowee, requestId: null,
		} as MiFollowing);
		txUsers.decrement.mockRejectedValue(dbError);

		await expect(service.rejectFollow(localFollowee, localFollower)).rejects.toBe(dbError);

		expect(db.transaction).toHaveBeenCalledTimes(1);
		expect(txCallbackError).toBe(dbError);
		expect(txFollowings.delete).toHaveBeenCalledExactlyOnceWith('following1');
		expect(followings.delete).not.toHaveBeenCalled();
		expect(users.decrement).not.toHaveBeenCalled();
		expect(globalEvent.publishInternalEvent).not.toHaveBeenCalled();
		expect(userEntity.pack).not.toHaveBeenCalled();
		expect(globalEvent.publishMainStream).not.toHaveBeenCalled();
		expect(webhook.enqueueUserWebhook).not.toHaveBeenCalled();
		expect(perUserFollowingChart.update).not.toHaveBeenCalled();
	});

	test('rejectFollow (removeFollow) で並行削除により delete の affected が 0 のとき、カウント減算や内部 unfollow イベント発行を行わない', async () => {
		followings.findOne.mockResolvedValue({
			id: 'following1', follower: localFollower, followee: localFollowee, requestId: null,
		} as MiFollowing);
		txFollowings.delete.mockResolvedValue({ affected: 0, raw: [] });

		await service.rejectFollow(localFollowee, localFollower);

		expect(db.transaction).toHaveBeenCalledTimes(1);
		expect(txFollowings.delete).toHaveBeenCalledExactlyOnceWith('following1');
		expect(txUsers.decrement).not.toHaveBeenCalled();
		expect(globalEvent.publishInternalEvent).not.toHaveBeenCalled();
		expect(perUserFollowingChart.update).not.toHaveBeenCalled();
	});
});
