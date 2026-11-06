/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { NotificationService } from '@/core/NotificationService.js';

// 2秒後の未読通知の遅延処理が失敗しても、未処理の rejection になってプロセスを落とさないことを確認する。
// (アプリ通知 = SSO 連携の解除通知なども同じ経路を通る)
// NotificationService は import 時点で node:timers/promises の setTimeout を束縛するため、fake timers は使えず実時間で待つ。
describe('NotificationService 遅延処理の失敗', () => {
	const unhandled: unknown[] = [];
	const onUnhandled = (reason: unknown) => { unhandled.push(reason); };

	afterEach(() => {
		process.off('unhandledRejection', onUnhandled);
		unhandled.length = 0;
	});

	test('遅延処理の中で Redis が失敗しても、未処理の rejection にならない', async () => {
		process.on('unhandledRejection', onUnhandled);
		const publishMainStream = vi.fn();
		const service = new NotificationService(
			{ perUserNotificationsMaxCount: 1000 } as any,
			{ xadd: vi.fn(async () => '1-1'), get: vi.fn(async () => { throw new Error('redis down'); }) } as any,
			{ findOneBy: vi.fn(async () => null) } as any,
			{ pack: vi.fn(async () => ({ id: 'packed1' })) } as any,
			{ gen: vi.fn(() => 'notif1'), parse: vi.fn(() => ({ date: new Date(0) })), parseFull: vi.fn(() => ({ date: new Date(0), additional: 0n })) } as any,
			{ publishMainStream } as any,
			{ pushNotification: vi.fn() } as any,
			{
				userProfileCache: { fetch: vi.fn(async () => ({ notificationRecieveConfig: {} })) },
				userMutingsCache: { fetch: vi.fn(async () => new Set()) },
			} as any,
			{} as any,
		);

		await service.createNotification('user1', 'app', { appAccessTokenId: null, customBody: 'b', customHeader: 'h', customIcon: null });
		await new Promise(resolve => setTimeout(resolve, 2300));

		expect(unhandled).toEqual([]);
		// 失敗した遅延処理は未読イベントを出さない (通知そのものは作成済み)
		expect(publishMainStream).not.toHaveBeenCalledWith('user1', 'unreadNotification', expect.anything());
	}, 10_000);
});
