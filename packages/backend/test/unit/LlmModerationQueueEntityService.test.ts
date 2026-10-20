/*
 * SPDX-FileCopyrightText: chan-mai and lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { EntityNotFoundError } from 'typeorm';
import { LlmModerationQueueEntityService } from '@/core/entities/LlmModerationQueueEntityService.js';
import { MiLlmModerationQueue } from '@/models/_.js';

function createQueue(overrides: Partial<MiLlmModerationQueue> = {}): MiLlmModerationQueue {
	return {
		id: '2026010100000000',
		noteId: 'note1',
		noteUserId: 'user1',
		noteUserHost: null,
		noteVisibility: 'public',
		isRemote: false,
		provider: 'openai',
		model: 'omni-moderation-latest',
		flaggedCategories: ['violence'],
		categoryScores: { violence: 0.9 },
		rawResult: null,
		resolved: false,
		resolvedAt: null,
		resolvedById: null,
		moderationNote: null,
		assigneeId: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		...overrides,
	} as unknown as MiLlmModerationQueue;
}

function createService(options: {
	note?: any;
	user?: any;
	queue?: MiLlmModerationQueue | null;
} = {}) {
	const {
		note = { id: 'note1', text: 'hello' },
		user = { id: 'user1', name: 'user' },
		queue = createQueue(),
	} = options;

	const llmModerationQueueRepository = {
		findOneByOrFail: vi.fn(async () => {
			if (queue === null) throw new EntityNotFoundError(MiLlmModerationQueue, {});
			return queue;
		}),
	};

	const noteEntityService = {
		pack: vi.fn(async () => note),
	};

	const userEntityService = {
		pack: vi.fn(async () => user),
	};

	const idService = {
		parse: vi.fn(() => ({ date: new Date('2026-01-01T00:00:00.000Z') })),
	};

	const service = new LlmModerationQueueEntityService(
		llmModerationQueueRepository as any,
		noteEntityService as any,
		userEntityService as any,
		idService as any,
	);

	return { service, llmModerationQueueRepository, noteEntityService, userEntityService, idService };
}

describe('LlmModerationQueueEntityService', () => {
	test('packs a queue entry with note and user', async () => {
		const { service, noteEntityService, userEntityService } = createService();

		const packed = await service.pack(createQueue());

		expect(noteEntityService.pack).toHaveBeenCalledWith('note1', undefined, { detail: true, skipHide: true });
		expect(userEntityService.pack).toHaveBeenCalledWith('user1', null, { schema: 'UserDetailedNotMe' });
		expect(packed.id).toBe('2026010100000000');
		expect(packed.createdAt).toBe('2026-01-01T00:00:00.000Z');
		expect(packed.provider).toBe('openai');
		expect(packed.flaggedCategories).toEqual(['violence']);
		expect(packed.resolved).toBe(false);
		expect(packed.assignee).toBeNull();
	});

	test('resolves the queue entity by id when only an id is given', async () => {
		const { service, llmModerationQueueRepository } = createService();

		await service.pack('2026010100000000');

		expect(llmModerationQueueRepository.findOneByOrFail).toHaveBeenCalledWith({ id: '2026010100000000' });
	});

	test('packs the assignee when it is set', async () => {
		const { service, userEntityService } = createService({
			queue: createQueue({ assigneeId: 'moderator1' }),
		});

		const packed = await service.pack(createQueue({ assigneeId: 'moderator1' }));

		expect(userEntityService.pack).toHaveBeenCalledWith('moderator1', null, { schema: 'UserDetailedNotMe' });
		expect(packed.assigneeId).toBe('moderator1');
	});

	test('returns null for the note when the note no longer exists', async () => {
		const { service, noteEntityService } = createService();
		noteEntityService.pack.mockRejectedValue(new EntityNotFoundError(Object, {}));

		const packed = await service.pack(createQueue());

		expect(packed.note).toBeNull();
		expect(packed.noteUser).not.toBeNull();
	});

	test('packMany packs every entry', async () => {
		const { service } = createService();

		const packed = await service.packMany([createQueue(), createQueue({ id: '2026010100000001' })]);

		expect(packed).toHaveLength(2);
		expect(packed[0].id).toBe('2026010100000000');
		expect(packed[1].id).toBe('2026010100000001');
	});
});
