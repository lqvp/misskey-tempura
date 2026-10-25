/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { CleanupDanglingFollowsProcessorService } from '@/queue/processors/CleanupDanglingFollowsProcessorService.js';

type FollowingRow = { id: string; followerId: string; followeeId: string };

function unwrap(value: any): any {
	// FindOperator (In(...) など) を素の値に戻す
	return value != null && typeof value === 'object' && 'value' in value ? value.value : value;
}

function createService(options: {
	followings?: FollowingRow[];
	users?: Array<{ id: string; isDeleted?: boolean }>;
	transactionError?: Error;
	notificationError?: Error;
	userLookupError?: (call: number) => Error | undefined;
	deleteError?: (call: number) => Error | undefined;
} = {}) {
	const state = {
		followings: [...(options.followings ?? [])] as FollowingRow[],
		// 行が存在するユーザーのみ。削除完了で行ごと消えたユーザーは含めない
		users: new Map((options.users ?? []).map(u => [u.id, u])),
	};

	const userUpdates: Array<{ id: string; patch: any }> = [];

	let deleteCalls = 0;
	const manager = {
		delete: vi.fn(async (_entity: any, criteria: Array<Record<string, any>> | Record<string, any>) => {
			const err = options.deleteError?.(deleteCalls++);
			if (err) throw err;
			const list = Array.isArray(criteria) ? criteria : [criteria];
			state.followings = state.followings.filter(row =>
				!list.some(c => {
					const followerId = unwrap(c.followerId);
					const followeeId = unwrap(c.followeeId);
					const followerMatch = followerId === undefined || (Array.isArray(followerId) ? followerId.includes(row.followerId) : row.followerId === followerId);
					const followeeMatch = followeeId === undefined || (Array.isArray(followeeId) ? followeeId.includes(row.followeeId) : row.followeeId === followeeId);
					return followerMatch && followeeMatch;
				}));
		}),
		count: vi.fn(async (_entity: any, opts: { where: Record<string, any> }) => {
			const where = opts.where;
			return state.followings.filter(row =>
				(where.followerId === undefined || row.followerId === where.followerId) &&
				(where.followeeId === undefined || row.followeeId === where.followeeId)).length;
		}),
		update: vi.fn(async (_entity: any, id: string, patch: any) => {
			userUpdates.push({ id, patch });
		}),
	};

	const followingsRepository = {
		find: vi.fn(async (opts: { where: Array<Record<string, any>>; take?: number }) => {
			const wheres = Array.isArray(opts.where) ? opts.where : [opts.where];
			// TypeORMのキーセットページネーション (id > cursor, id ASC, take) をエミュレートする
			const cursor = wheres[0]?.id != null ? unwrap(wheres[0].id) : undefined;
			let rows = state.followings.filter(row => wheres.some(w =>
				(w.followerId === undefined || row.followerId === w.followerId) &&
				(w.followeeId === undefined || row.followeeId === w.followeeId)));
			if (cursor != null) rows = rows.filter(row => row.id > cursor);
			rows = rows.sort((a, b) => a.id.localeCompare(b.id));
			return rows.slice(0, opts.take ?? rows.length)
				.map(row => ({ id: row.id, followerId: row.followerId, followeeId: row.followeeId }));
		}),
		manager: {
			// 実際のトランザクションのように、途中失敗時は関係テーブルの変更をロールバックする
			transaction: vi.fn(async (cb: (m: typeof manager) => Promise<void>) => {
				if (options.transactionError) throw options.transactionError;
				const snapshot = [...state.followings];
				try {
					await cb(manager);
				} catch (e) {
					state.followings = snapshot;
					throw e;
				}
			}),
		},
	};

	let userLookupCalls = 0;
	const usersRepository = {
		find: vi.fn(async (opts: { where: { id: any } }) => {
			const err = options.userLookupError?.(userLookupCalls++);
			if (err) throw err;
			const ids: string[] = unwrap(opts.where.id);
			return ids
				.filter(id => state.users.has(id))
				.map(id => ({ id, isDeleted: state.users.get(id)!.isDeleted ?? false }));
		}),
	};

	const logger = { info: vi.fn(), succ: vi.fn(), warn: vi.fn() };
	const queueLoggerService = {
		logger: { createSubLogger: vi.fn(() => logger) },
	};

	const notificationService = {
		createNotification: vi.fn(async () => {
			if (options.notificationError) throw options.notificationError;
		}),
	};

	const cacheService = {
		userFollowingsCache: { refresh: vi.fn() },
		userByIdCache: { delete: vi.fn() },
		localUserByIdCache: { delete: vi.fn() },
	};

	const service = new CleanupDanglingFollowsProcessorService(
		usersRepository as any,
		followingsRepository as any,
		queueLoggerService as any,
		notificationService as any,
		cacheService as any,
	);

	return { service, state, manager, followingsRepository, usersRepository, notificationService, cacheService, logger };
}

function job(userId: string) {
	return { data: { user: { id: userId } } } as any;
}

describe('CleanupDanglingFollowsProcessorService', () => {
	test('removes relations with deleted users only, recalculates counters, and notifies with the cleaned count', async () => {
		const { service, state, manager, notificationService, cacheService } = createService({
			followings: [
				{ id: 'f1', followerId: 'user1', followeeId: 'live1' },
				{ id: 'f2', followerId: 'user1', followeeId: 'deleted1' },
				{ id: 'f3', followerId: 'live2', followeeId: 'user1' },
				{ id: 'f4', followerId: 'deleted2', followeeId: 'user1' },
				// 自分自身と無関係の関係は触らない
				{ id: 'f5', followerId: 'live1', followeeId: 'deleted1' },
			],
			users: [
				{ id: 'user1' }, { id: 'live1' }, { id: 'live2' },
				{ id: 'deleted1', isDeleted: true }, { id: 'deleted2', isDeleted: true },
			],
		});

		const message = await service.process(job('user1'));

		// deleted1/deleted2 との関係だけが消え、live1/live2 との関係と無関係の f5 は残る
		expect(state.followings.map(f => f.id).sort()).toStrictEqual(['f1', 'f3', 'f5']);
		// カウンターが実測値で更新される (following: f1 のみ / followers: f3 のみ)
		expect(manager.update).toHaveBeenCalledWith(expect.anything(), 'user1', { followingCount: 1, followersCount: 1 });
		expect(notificationService.createNotification).toHaveBeenCalledWith('user1', 'cleanupDanglingFollowsCompleted', { count: 2 });
		// 直接DELETEのためキャッシュイベントは発火しないので、フォローキャッシュを明示リフレッシュする
		expect(cacheService.userFollowingsCache.refresh).toHaveBeenCalledWith('user1');
		expect(message).toContain('2 deleted users');
	});

	test('does not delete anything and notifies with count 0 when there is nothing dangling', async () => {
		const { service, state, manager, notificationService } = createService({
			followings: [
				{ id: 'f1', followerId: 'user1', followeeId: 'live1' },
			],
			users: [{ id: 'user1' }, { id: 'live1' }],
		});

		const message = await service.process(job('user1'));

		expect(manager.delete).not.toHaveBeenCalled();
		expect(state.followings).toHaveLength(1);
		expect(manager.update).toHaveBeenCalledWith(expect.anything(), 'user1', { followingCount: 1, followersCount: 0 });
		expect(notificationService.createNotification).toHaveBeenCalledWith('user1', 'cleanupDanglingFollowsCompleted', { count: 0 });
		expect(message).toContain('No dangling relationships');
	});

	test('batches the deleted-user lookup when there are many related users', async () => {
		const followings: FollowingRow[] = [];
		for (let i = 0; i < 150; i++) {
			followings.push({ id: `f${i}`, followerId: 'user1', followeeId: `u${i}` });
		}
		const users: Array<{ id: string; isDeleted?: boolean }> = [{ id: 'user1' }];
		for (let i = 0; i < 150; i++) users.push({ id: `u${i}` });
		const { service, usersRepository } = createService({ followings, users });

		await service.process(job('user1'));

		// BATCH_SIZE=100 なので 150 件は 2 回に分割される
		expect(usersRepository.find).toHaveBeenCalledTimes(2);
	});

	test('propagates transaction failure and does not notify, so a Bull retry can redo the work', async () => {
		const { service, state, notificationService } = createService({
			followings: [
				{ id: 'f1', followerId: 'user1', followeeId: 'deleted1' },
			],
			users: [{ id: 'user1' }, { id: 'deleted1', isDeleted: true }],
			transactionError: new Error('deadlock detected'),
		});

		await expect(service.process(job('user1'))).rejects.toThrow('deadlock detected');

		// 失敗時は関係が残ったままで、通知も飛ばない (リトライで再処理される前提)
		expect(state.followings).toHaveLength(1);
		expect(notificationService.createNotification).not.toHaveBeenCalled();
	});

	test('is idempotent when the job runs twice (double cleanup)', async () => {
		const { service, state, manager, notificationService } = createService({
			followings: [
				{ id: 'f1', followerId: 'user1', followeeId: 'deleted1' },
				{ id: 'f2', followerId: 'user1', followeeId: 'live1' },
			],
			users: [{ id: 'user1' }, { id: 'live1' }, { id: 'deleted1', isDeleted: true }],
		});

		await service.process(job('user1'));
		const message2 = await service.process(job('user1'));

		expect(state.followings.map(f => f.id)).toStrictEqual(['f2']);
		// 2 回目は削除対象なしで delete は合計 1 回だけ
		expect(manager.delete).toHaveBeenCalledTimes(1);
		expect(message2).toContain('No dangling relationships');
		expect(notificationService.createNotification).toHaveBeenLastCalledWith('user1', 'cleanupDanglingFollowsCompleted', { count: 0 });
	});

	test('paginates the relation scan across pages without missing rows or duplicating the counter update', async () => {
		// 1200件の関係 (うち50件が削除済みアカウント宛) で 500+500+200 の3ページ走査になる
		const followings: FollowingRow[] = [];
		const users: Array<{ id: string; isDeleted?: boolean }> = [{ id: 'user1' }];
		for (let i = 0; i < 1200; i++) {
			const uid = `u${String(i).padStart(4, '0')}`;
			followings.push({ id: `f${String(i).padStart(4, '0')}`, followerId: 'user1', followeeId: uid });
			users.push(i < 50 ? { id: uid, isDeleted: true } : { id: uid });
		}
		const { service, state, manager, followingsRepository, usersRepository, notificationService, cacheService } = createService({ followings, users });

		const message = await service.process(job('user1'));

		// 3ページで走査が終わる (無限ループしない)
		expect(followingsRepository.find).toHaveBeenCalledTimes(3);
		// ユーザー存在確認はページごとに100件バッチ (5+5+2)
		expect(usersRepository.find).toHaveBeenCalledTimes(12);
		// DELETEは500件チャンクで1回、カウンタ更新はちょうど1回
		expect(manager.delete).toHaveBeenCalledTimes(1);
		expect(manager.update).toHaveBeenCalledTimes(1);
		expect(manager.update).toHaveBeenCalledWith(expect.anything(), 'user1', { followingCount: 1150, followersCount: 0 });
		expect(state.followings).toHaveLength(1150);
		expect(notificationService.createNotification).toHaveBeenCalledWith('user1', 'cleanupDanglingFollowsCompleted', { count: 50 });
		expect(cacheService.userFollowingsCache.refresh).toHaveBeenCalledTimes(1);
		expect(message).toContain('50 deleted users');
	});

	test('handles a scan page of exactly SCAN_BATCH rows by fetching one more (empty) page and terminating', async () => {
		const followings: FollowingRow[] = [];
		const users: Array<{ id: string; isDeleted?: boolean }> = [{ id: 'user1' }];
		for (let i = 0; i < 500; i++) {
			const uid = `u${String(i).padStart(4, '0')}`;
			followings.push({ id: `f${String(i).padStart(4, '0')}`, followerId: 'user1', followeeId: uid });
			users.push({ id: uid });
		}
		const { service, followingsRepository } = createService({ followings, users });

		await service.process(job('user1'));

		// 500件ちょうどのページのあと空ページを1回取得して終了 (2回で打ち止め)
		expect(followingsRepository.find).toHaveBeenCalledTimes(2);
	});

	test('a failure during the scan phase writes nothing, and a retry completes the cleanup', async () => {
		let failFirstLookup = true;
		const ctx = createService({
			followings: [
				{ id: 'f0001', followerId: 'user1', followeeId: 'deleted1' },
				{ id: 'f0002', followerId: 'user1', followeeId: 'live1' },
			],
			users: [{ id: 'user1' }, { id: 'live1' }, { id: 'deleted1', isDeleted: true }],
			userLookupError: () => failFirstLookup ? new Error('connection reset') : undefined,
		});

		// 走査途中の失敗はジョブを失敗させるが、書き込み (tx) 前なので状態は無変更
		await expect(ctx.service.process(job('user1'))).rejects.toThrow('connection reset');
		expect(ctx.state.followings).toHaveLength(2);
		expect(ctx.manager.delete).not.toHaveBeenCalled();
		expect(ctx.notificationService.createNotification).not.toHaveBeenCalled();

		// リトライで完走する
		failFirstLookup = false;
		const message = await ctx.service.process(job('user1'));
		expect(ctx.state.followings.map(f => f.id)).toStrictEqual(['f0002']);
		expect(ctx.manager.update).toHaveBeenCalledTimes(1);
		expect(message).toContain('1 deleted users');
	});

	test('splits deletions into chunks when deleted relations exceed DELETE_CHUNK, updating the counter once', async () => {
		// 1200件すべて削除済みアカウント宛 → DELETEは500+500+200の3チャンク
		const followings: FollowingRow[] = [];
		const users: Array<{ id: string; isDeleted?: boolean }> = [{ id: 'user1' }];
		for (let i = 0; i < 1200; i++) {
			const uid = `u${String(i).padStart(4, '0')}`;
			followings.push({ id: `f${String(i).padStart(4, '0')}`, followerId: 'user1', followeeId: uid });
			users.push({ id: uid, isDeleted: true });
		}
		const { service, state, manager, notificationService } = createService({ followings, users });

		await service.process(job('user1'));

		expect(manager.delete).toHaveBeenCalledTimes(3);
		// チャンク合計の取りこぼしなし: 全1200件が消える
		expect(state.followings).toHaveLength(0);
		// カウンタ更新はトランザクション内でちょうど1回
		expect(manager.update).toHaveBeenCalledTimes(1);
		expect(manager.update).toHaveBeenCalledWith(expect.anything(), 'user1', { followingCount: 0, followersCount: 0 });
		expect(notificationService.createNotification).toHaveBeenCalledWith('user1', 'cleanupDanglingFollowsCompleted', { count: 1200 });
	});

	test('rolls back the whole transaction when a later delete chunk fails, and a retry completes', async () => {
		let failSecondChunk = true;
		const followings: FollowingRow[] = [];
		const users: Array<{ id: string; isDeleted?: boolean }> = [{ id: 'user1' }];
		for (let i = 0; i < 1200; i++) {
			const uid = `u${String(i).padStart(4, '0')}`;
			followings.push({ id: `f${String(i).padStart(4, '0')}`, followerId: 'user1', followeeId: uid });
			users.push({ id: uid, isDeleted: true });
		}
		const ctx = createService({
			followings,
			users,
			deleteError: call => (failSecondChunk && call === 1) ? new Error('deadlock detected') : undefined,
		});

		// 2チャンク目の失敗でトランザクションごとロールバックされる (1チャンク目の削除も残る)
		await expect(ctx.service.process(job('user1'))).rejects.toThrow('deadlock detected');
		expect(ctx.state.followings).toHaveLength(1200);
		expect(ctx.manager.update).not.toHaveBeenCalled();
		expect(ctx.notificationService.createNotification).not.toHaveBeenCalled();

		// リトライで全チャンクが通り完走する
		failSecondChunk = false;
		const message = await ctx.service.process(job('user1'));
		expect(ctx.state.followings).toHaveLength(0);
		expect(ctx.manager.update).toHaveBeenCalledTimes(1);
		expect(message).toContain('1200 deleted users');
	});

	test('treats relations to users whose rows are already gone (post-deletion) as dangling', async () => {
		const { service, state, notificationService } = createService({
			followings: [
				{ id: 'f1', followerId: 'user1', followeeId: 'ghost1' }, // 行が既に存在しない
				{ id: 'f2', followerId: 'user1', followeeId: 'live1' },
			],
			users: [{ id: 'user1' }, { id: 'live1' }],
		});

		const message = await service.process(job('user1'));

		expect(state.followings.map(f => f.id)).toStrictEqual(['f2']);
		expect(notificationService.createNotification).toHaveBeenCalledWith('user1', 'cleanupDanglingFollowsCompleted', { count: 1 });
		expect(message).toContain('1 deleted users');
	});

	test('invalidates the user entity caches after recalculating counters', async () => {
		const { service, cacheService } = createService({
			followings: [
				{ id: 'f1', followerId: 'user1', followeeId: 'deleted1' },
			],
			users: [{ id: 'user1' }, { id: 'deleted1', isDeleted: true }],
		});

		await service.process(job('user1'));

		expect(cacheService.userByIdCache.delete).toHaveBeenCalledWith('user1');
		expect(cacheService.localUserByIdCache.delete).toHaveBeenCalledWith('user1');
	});

	test('a cache refresh failure does not fail the job', async () => {
		const { service, state, cacheService, logger } = createService({
			followings: [
				{ id: 'f1', followerId: 'user1', followeeId: 'deleted1' },
			],
			users: [{ id: 'user1' }, { id: 'deleted1', isDeleted: true }],
		});
		cacheService.userFollowingsCache.refresh.mockRejectedValue(new Error('redis down'));

		const message = await service.process(job('user1'));

		expect(state.followings).toHaveLength(0);
		expect(logger.warn).toHaveBeenCalled();
		expect(message).toContain('1 deleted users');
	});

	test('a notification failure does not fail the job', async () => {
		const { service, state, logger } = createService({
			followings: [
				{ id: 'f1', followerId: 'user1', followeeId: 'deleted1' },
			],
			users: [{ id: 'user1' }, { id: 'deleted1', isDeleted: true }],
			notificationError: new Error('notification backend down'),
		});

		const message = await service.process(job('user1'));

		expect(state.followings).toHaveLength(0);
		expect(logger.warn).toHaveBeenCalled();
		expect(message).toContain('1 deleted users');
	});
});
