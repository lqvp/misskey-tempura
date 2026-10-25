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
