/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { NotificationService } from '@/core/NotificationService.js';

function createService(userProfileCache: { fetch: (id: string) => Promise<any> }) {
	// createNotification の戻り値の検証が目的のため、内部で最初にawaitされる
	// userProfileCache.fetch 以外の依存は使用されない
	const service = new NotificationService(
		{} as any, // config
		{} as any, // redis
		{} as any, // usersRepository
		{} as any, // notificationEntityService
		{} as any, // idService
		{} as any, // globalEventService
		{} as any, // pushNotificationService
		{ userProfileCache } as any,
		{} as any, // userListService
	);
	return service;
}

describe('NotificationService (createNotification return value)', () => {
	// 呼び出し側が完了/失敗を待てるように、内部処理のPromiseをそのまま返すことを検証する
	// (以前はtrackPromiseに渡すだけで返さず、awaitしても失敗を捕捉できなかった)

	test('a failure of the internal creation propagates to the awaiting caller', async () => {
		const service = createService({
			fetch: vi.fn(async () => {
				throw new Error('cache backend down');
			}),
		});

		await expect(service.createNotification('user1', 'test', {})).rejects.toThrow('cache backend down');
	});

	test('the returned promise resolves with null when the user muted the notification type', async () => {
		const service = createService({
			fetch: vi.fn(async () => ({
				notificationRecieveConfig: { test: { type: 'never' } },
			})),
		});

		await expect(service.createNotification('user1', 'test', {})).resolves.toBeNull();
	});
});

describe('NotificationService (deferred unread-notification task)', () => {
	// NOTE: NotificationServiceは import 時点で node:timers/promises の setTimeout を束縛するため
	// fake timers では差し替えられない。実時間で interval(2000ms) 経過を待つ。

	function createFullService(usersRepository: any) {
		return new NotificationService(
			{ perUserNotificationsMaxCount: 1000 } as any, // config
			{ xadd: vi.fn(async () => '1-1'), get: vi.fn(async () => null) } as any, // redis
			usersRepository, // usersRepository
			{ pack: vi.fn(async () => ({ id: 'packed1' })) } as any, // notificationEntityService
			{ gen: vi.fn(() => 'notif1'), parse: vi.fn(() => ({ date: new Date(0) })), parseFull: vi.fn(() => ({ date: new Date(0), additional: 0n })) } as any, // idService
			{ publishMainStream: vi.fn() } as any, // globalEventService
			{ pushNotification: vi.fn() } as any, // pushNotificationService
			{
				userProfileCache: { fetch: vi.fn(async () => ({ notificationRecieveConfig: {} })) },
				userMutingsCache: { fetch: vi.fn(async () => new Set()) },
			} as any, // cacheService
			{} as any, // userListService
		);
	}

	test('2秒後の遅延処理でnotifierが削除済みでもrejectせず、未読イベントは発行する', async () => {
		// アカウント削除でnotifier行が消えた後に遅延タスクが走る経路の回帰テスト
		const usersRepository = { findOneBy: vi.fn(async () => null) };
		const service = createFullService(usersRepository);
		const emailSpy = vi.spyOn(service as any, 'emailNotificationUnFollow').mockImplementation(async () => {});

		await service.createNotification('user1', 'unfollow', {}, 'deleted-user');
		await new Promise(resolve => setTimeout(resolve, 2100));

		const globalEventService = (service as any).globalEventService;
		expect(usersRepository.findOneBy).toHaveBeenCalledWith({ id: 'deleted-user' });
		expect(emailSpy).not.toHaveBeenCalled();
		expect(globalEventService.publishMainStream).toHaveBeenCalledWith('user1', 'unreadNotification', { id: 'packed1' });
	});

	test('2秒後の遅延処理でnotifierが存在すればメール送信に進む', async () => {
		const usersRepository = { findOneBy: vi.fn(async () => ({ id: 'notifier1' })) };
		const service = createFullService(usersRepository);
		const emailSpy = vi.spyOn(service as any, 'emailNotificationUnFollow').mockImplementation(async () => {});

		await service.createNotification('user1', 'unfollow', {}, 'notifier1');
		await new Promise(resolve => setTimeout(resolve, 2100));

		expect(emailSpy).toHaveBeenCalledWith('user1', { id: 'notifier1' });
	});
});
