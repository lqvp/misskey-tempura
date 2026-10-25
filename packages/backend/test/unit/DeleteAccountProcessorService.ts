/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { DeleteAccountProcessorService } from '@/queue/processors/DeleteAccountProcessorService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';

type FollowingRow = { id: string; followerId: string; followeeId: string };

function unwrap(value: any): any {
	return value != null && typeof value === 'object' && 'value' in value ? value.value : value;
}

function createService(options: {
	user: any;
	followings?: FollowingRow[];
	unfollowError?: (f: FollowingRow) => Error | undefined;
} ) {
	const state = {
		followings: [...(options.followings ?? [])] as FollowingRow[],
	};
	const users = new Map<string, any>([[options.user.id, options.user]]);
	// 関係の相手方ユーザーも存在させる (followee/follower の Map 引きに必要)
	for (const f of options.followings ?? []) {
		for (const id of [f.followerId, f.followeeId]) {
			if (!users.has(id)) users.set(id, localUser(id));
		}
	}

	const usersRepository = {
		findOneBy: vi.fn(async ({ id }: { id: string }) => users.get(id) ?? null),
		findBy: vi.fn(async ({ id }: { id: any }) => {
			const ids: string[] = unwrap(id);
			return ids.map(i => users.get(i)).filter(u => u != null);
		}),
		delete: vi.fn(async () => {}),
	};
	const followingsRepository = {
		find: vi.fn(async (opts: { where: Record<string, any> | Array<Record<string, any>>; take?: number; order?: any }) => {
			const wheres = Array.isArray(opts.where) ? opts.where : [opts.where];
			const cursor = wheres[0]?.id != null ? unwrap(wheres[0].id) : undefined;
			let rows = state.followings.filter(row => wheres.some(w =>
				(w.followerId === undefined || row.followerId === w.followerId) &&
				(w.followeeId === undefined || row.followeeId === w.followeeId)));
			if (cursor != null) rows = rows.filter(row => row.id > cursor);
			rows = rows.sort((a, b) => a.id.localeCompare(b.id));
			return rows.slice(0, opts.take ?? rows.length);
		}),
	};
	const userFollowingService = {
		unfollow: vi.fn(async (follower: any, followee: any, _silent?: boolean) => {
			const row = state.followings.find(f => f.followerId === follower.id && f.followeeId === followee.id);
			if (!row) return; // 既に解消済み (リトライ時の安全側)
			const err = options.unfollowError?.(row);
			if (err) throw err;
			state.followings = state.followings.filter(f => f !== row);
		}),
	};
	const logger = { info: vi.fn(), succ: vi.fn(), warn: vi.fn() };
	const queueLoggerService = { logger: { createSubLogger: vi.fn(() => logger) } };

	const emptyRepo = { find: vi.fn(async () => []) };
	const service = new DeleteAccountProcessorService(
		usersRepository as any,
		{ findOneByOrFail: vi.fn(async () => ({ email: 'user@example.com' })) } as any,
		emptyRepo as any, // notes
		emptyRepo as any, // driveFiles
		emptyRepo as any, // pages
		followingsRepository as any,
		{ deleteFileSync: vi.fn() } as any, // driveService
		{ delete: vi.fn() } as any, // pageService
		{ sendEmail: vi.fn() } as any, // emailService
		queueLoggerService as any,
		{ unindexNote: vi.fn() } as any, // searchService
		userFollowingService as any,
	);

	return { service, state, usersRepository, followingsRepository, userFollowingService, logger };
}

function job(userId: string) {
	return { data: { user: { id: userId } } } as any;
}

const localUser = (id: string) => ({ id, host: null, uri: null, inbox: null, sharedInbox: null });

describe('DeleteAccountProcessorService (unfollow severing)', () => {
	test('severs outgoing and incoming follow relations during account deletion', async () => {
		const { service, state, userFollowingService } = createService({
			user: localUser('user1'),
			followings: [
				{ id: 'f1', followerId: 'user1', followeeId: 'u2' },
				{ id: 'f2', followerId: 'u3', followeeId: 'user1' },
			],
		});

		const result = await service.process(job('user1'));

		expect(result).toBe('Account deleted');
		expect(state.followings).toHaveLength(0);
		expect(userFollowingService.unfollow).toHaveBeenCalledTimes(2);
	});

	test('an infra failure fails the job so Bull retries it (no silent dangling relation)', async () => {
		const { service, state, userFollowingService } = createService({
			user: localUser('user1'),
			followings: [
				{ id: 'f1', followerId: 'user1', followeeId: 'u2' },
				{ id: 'f2', followerId: 'user1', followeeId: 'u3' },
			],
			unfollowError: f => f.followeeId === 'u3' ? new Error('connection reset') : undefined,
		});

		await expect(service.process(job('user1'))).rejects.toThrow('failing the job so it will be retried');

		// 成功した側の関係は既に解消されている (失敗した u3 との関係のみ残る)
		expect(state.followings.map(f => f.id)).toStrictEqual(['f2']);
		expect(userFollowingService.unfollow).toHaveBeenCalledTimes(2);
	});

	test('a retry after an infra failure only reprocesses the remaining relations (idempotent)', async () => {
		let failU3 = true;
		const ctx = createService({
			user: localUser('user1'),
			followings: [
				{ id: 'f1', followerId: 'user1', followeeId: 'u2' },
				{ id: 'f2', followerId: 'user1', followeeId: 'u3' },
			],
			unfollowError: f => (f.followeeId === 'u3' && failU3) ? new Error('connection reset') : undefined,
		});

		await expect(ctx.service.process(job('user1'))).rejects.toThrow('failing the job');
		failU3 = false;
		const result = await ctx.service.process(job('user1'));

		expect(result).toBe('Account deleted');
		expect(ctx.state.followings).toHaveLength(0);
		// 2 回目の実行では残っていた u3 との関係だけが処理される
		expect(ctx.userFollowingService.unfollow).toHaveBeenCalledTimes(3);
		expect(ctx.userFollowingService.unfollow).toHaveBeenLastCalledWith(
			expect.objectContaining({ id: 'user1' }), expect.objectContaining({ id: 'u3' }), true, true,
		);
	});

	test('passes force=true so the forced-follow policy cannot leave relations behind (rows would be CASCADE-deleted anyway)', async () => {
		const { service, userFollowingService } = createService({
			user: localUser('user1'),
			followings: [
				{ id: 'f1', followerId: 'user1', followeeId: 'u2' },
				{ id: 'f2', followerId: 'u3', followeeId: 'user1' },
			],
		});

		await service.process(job('user1'));

		expect(userFollowingService.unfollow).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'user1' }), expect.objectContaining({ id: 'u2' }), true, true,
		);
		expect(userFollowingService.unfollow).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'u3' }), expect.objectContaining({ id: 'user1' }), true, true,
		);
	});

	test('any unfollow error fails the job (no error type is silently skipped)', async () => {
		const { service } = createService({
			user: localUser('user1'),
			followings: [
				{ id: 'f1', followerId: 'user1', followeeId: 'u2' },
			],
			unfollowError: () => new IdentifiableError('some-id', 'some business error'),
		});

		await expect(service.process(job('user1'))).rejects.toThrow('failing the job so it will be retried');
	});
});
