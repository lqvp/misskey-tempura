/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryFailedError } from 'typeorm';
import type { LlmModerationQueueRepository, MiLlmModerationQueue, MiNote, MiUser, UsersRepository } from '@/models/_.js';
import type { IdService } from '@/core/IdService.js';
import type { RoleService } from '@/core/RoleService.js';
import type { GlobalEventService } from '@/core/GlobalEventService.js';
import type { NotificationService } from '@/core/NotificationService.js';
import { LlmModerationQueueService } from '@/core/LlmModerationQueueService.js';

function makeDuplicateKeyError(): QueryFailedError {
	const driverError = Object.assign(new Error('duplicate key value'), { code: '23505' });
	return new QueryFailedError('INSERT', [], driverError as never);
}

/** インメモリのキューリポジトリ (noteId の一意制約を模倣する) */
class FakeQueueRepository {
	public rows: MiLlmModerationQueue[] = [];

	async insertOne(row: MiLlmModerationQueue): Promise<MiLlmModerationQueue> {
		if (this.rows.some(r => r.noteId === row.noteId)) {
			throw makeDuplicateKeyError();
		}
		this.rows.push(row);
		return row;
	}

	async findOneBy(where: { id?: string; noteId?: string }): Promise<MiLlmModerationQueue | null> {
		return this.rows.find(r =>
			(where.id === undefined || r.id === where.id) &&
			(where.noteId === undefined || r.noteId === where.noteId)
		) ?? null;
	}

	async findOneByOrFail(where: { id?: string; noteId?: string }): Promise<MiLlmModerationQueue> {
		const row = await this.findOneBy(where);
		if (!row) throw new Error('not found');
		return row;
	}

	async update(id: string, data: Partial<MiLlmModerationQueue>): Promise<void> {
		const row = this.rows.find(r => r.id === id);
		if (row) Object.assign(row, data);
	}

	async findBy(where: { id: { _type: 'in'; value: string[] } }): Promise<MiLlmModerationQueue[]> {
		return this.rows.filter(r => where.id.value.includes(r.id));
	}
}

const publishAdminStreamMock = vi.fn();
const createNotificationMock = vi.fn();
const getModeratorIdsMock = vi.fn();

function makeService(repo: FakeQueueRepository, moderators: string[] = []) {
	getModeratorIdsMock.mockResolvedValue(moderators);

	const usersRepository = {
		findOneByOrFail: async ({ id }: { id: string }) => ({ id, host: null }) as MiUser,
	} as unknown as UsersRepository;

	const idService = { gen: () => 'queue1' } as unknown as IdService;
	const roleService = { getModeratorIds: getModeratorIdsMock } as unknown as RoleService;
	const globalEventService = { publishAdminStream: publishAdminStreamMock } as unknown as GlobalEventService;
	const notificationService = { createNotification: createNotificationMock } as unknown as NotificationService;

	return new LlmModerationQueueService(
		repo as unknown as LlmModerationQueueRepository,
		usersRepository,
		idService,
		roleService,
		globalEventService,
		notificationService,
	);
}

function makeNote(overrides: Partial<MiNote> = {}): MiNote {
	return {
		id: 'note1',
		userId: 'user1',
		visibility: 'public',
		...overrides,
	} as MiNote;
}

const moderator = { id: 'mod1' } as MiUser;

describe('LlmModerationQueueService', () => {
	beforeEach(() => {
		publishAdminStreamMock.mockReset();
		createNotificationMock.mockReset();
		getModeratorIdsMock.mockReset();
	});

	describe('enqueue', () => {
		test('正常: キュー項目を登録する', async () => {
			const repo = new FakeQueueRepository();
			const svc = makeService(repo);

			const result = await svc.enqueue({
				note: makeNote(),
				provider: 'openai',
				model: 'omni-moderation-latest',
				flaggedCategories: ['harassment'],
				categoryScores: { harassment: 0.9 },
				rawResult: { flagged: true },
			});

			expect(result).not.toBeNull();
			expect(result!.noteId).toBe('note1');
			expect(result!.noteUserId).toBe('user1');
			expect(result!.isRemote).toBe(false);
			expect(result!.resolved).toBe(false);
			expect(result!.assigneeId).toBeNull();
			expect(result!.flaggedCategories).toEqual(['harassment']);
			expect(repo.rows).toHaveLength(1);
		});

		test('正常: 同じノートを再度登録しても重複しない', async () => {
			const repo = new FakeQueueRepository();
			const svc = makeService(repo);

			const first = await svc.enqueue({
				note: makeNote(),
				provider: 'openai',
				model: 'm',
				flaggedCategories: [],
				categoryScores: {},
				rawResult: null,
			});
			const second = await svc.enqueue({
				note: makeNote(),
				provider: 'openai',
				model: 'm',
				flaggedCategories: [],
				categoryScores: {},
				rawResult: null,
			});

			expect(second!.id).toBe(first!.id);
			expect(repo.rows).toHaveLength(1);
		});

		test('正常: モデレーターへ通知する', async () => {
			const repo = new FakeQueueRepository();
			const svc = makeService(repo, ['mod1', 'mod2']);

			await svc.enqueue({
				note: makeNote(),
				provider: 'openai',
				model: 'm',
				flaggedCategories: ['harassment'],
				categoryScores: {},
				rawResult: null,
			});

			expect(publishAdminStreamMock).toHaveBeenCalledTimes(2);
			expect(createNotificationMock).toHaveBeenCalledTimes(2);
			expect(createNotificationMock.mock.calls[0][1]).toBe('llmModerationQueue');
		});

		test('正常: モデレーターが居ない場合は通知しない', async () => {
			const repo = new FakeQueueRepository();
			const svc = makeService(repo, []);

			await svc.enqueue({
				note: makeNote(),
				provider: 'openai',
				model: 'm',
				flaggedCategories: [],
				categoryScores: {},
				rawResult: null,
			});

			expect(publishAdminStreamMock).not.toHaveBeenCalled();
			expect(createNotificationMock).not.toHaveBeenCalled();
		});
	});

	describe('resolve', () => {
		test('正常: 解決済みにする', async () => {
			const repo = new FakeQueueRepository();
			const svc = makeService(repo);

			await svc.enqueue({
				note: makeNote(),
				provider: 'openai',
				model: 'm',
				flaggedCategories: [],
				categoryScores: {},
				rawResult: null,
			});

			await svc.resolve('queue1', moderator, { moderationNote: '対応済み' });

			const row = await repo.findOneBy({ id: 'queue1' });
			expect(row!.resolved).toBe(true);
			expect(row!.assigneeId).toBe('mod1');
			expect(row!.moderationNote).toBe('対応済み');
		});

		test('異常: 存在しない ID は例外になる', async () => {
			const repo = new FakeQueueRepository();
			const svc = makeService(repo);

			await expect(svc.resolve('unknown', moderator)).rejects.toThrow();
		});
	});

	describe('update', () => {
		test('正常: モデレーションメモを更新する', async () => {
			const repo = new FakeQueueRepository();
			const svc = makeService(repo);

			await svc.enqueue({
				note: makeNote(),
				provider: 'openai',
				model: 'm',
				flaggedCategories: [],
				categoryScores: {},
				rawResult: null,
			});

			await svc.update('queue1', { moderationNote: '確認中' }, moderator);

			const row = await repo.findOneBy({ id: 'queue1' });
			expect(row!.moderationNote).toBe('確認中');
			expect(row!.assigneeId).toBe('mod1');
			expect(row!.resolved).toBe(false);
		});

		test('異常: 存在しない ID は例外になる', async () => {
			const repo = new FakeQueueRepository();
			const svc = makeService(repo);

			await expect(svc.update('unknown', {}, moderator)).rejects.toThrow();
		});
	});

	describe('fetchByIds', () => {
		test('正常: 指定した ID の項目を返す', async () => {
			const repo = new FakeQueueRepository();
			const svc = makeService(repo);

			await svc.enqueue({
				note: makeNote(),
				provider: 'openai',
				model: 'm',
				flaggedCategories: [],
				categoryScores: {},
				rawResult: null,
			});

			const rows = await svc.fetchByIds(['queue1']);
			expect(rows).toHaveLength(1);
			expect(rows[0].id).toBe('queue1');
		});
	});
});
