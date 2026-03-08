/*
 * SPDX-FileCopyrightText:chan-mai and lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { LlmModerationQueueRepository, MiLlmModerationQueue, MiNote, MiUser, UsersRepository } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import { RoleService } from '@/core/RoleService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import { ApiError } from '@/server/api/error.js';
import { noSuchLlmModerationQueueError } from '@/core/errors/llm-moderation-queue.js';
import Logger from '@/logger.js';

const logger = new Logger('llm-moderation-queue');

@Injectable()
export class LlmModerationQueueService {
	constructor(
		@Inject(DI.llmModerationQueueRepository)
		private llmModerationQueueRepository: LlmModerationQueueRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private idService: IdService,
		private roleService: RoleService,
		private globalEventService: GlobalEventService,
		private notificationService: NotificationService,
	) {
	}

	public async enqueue(params: {
		note: MiNote;
		provider: string;
		model: string;
		flaggedCategories: string[];
		categoryScores: Record<string, number>;
		rawResult: Record<string, any> | null;
	}): Promise<MiLlmModerationQueue | null> {
		const noteUser = await this.usersRepository.findOneByOrFail({ id: params.note.userId });

		let record: MiLlmModerationQueue;
		try {
			record = await this.llmModerationQueueRepository.insertOne({
				id: this.idService.gen(),
				noteId: params.note.id,
				noteUserId: params.note.userId,
				noteUserHost: noteUser.host,
				noteVisibility: params.note.visibility,
				isRemote: noteUser.host != null,
				provider: params.provider,
				model: params.model,
				flaggedCategories: params.flaggedCategories,
				categoryScores: params.categoryScores,
				rawResult: params.rawResult,
				resolved: false,
				assigneeId: null,
				moderationNote: '',
			});
		} catch (err) {
			if (!isDuplicateKeyValueError(err)) throw err;
			const existing = await this.llmModerationQueueRepository.findOneBy({ noteId: params.note.id });
			if (!existing) throw err;
			return existing;
		}

		try {
			await this.notifyModerators(record);
		} catch (err) {
			logger.warn('Failed to notify moderators about LLM moderation queue item', {
				errorMessage: err instanceof Error ? err.message : String(err),
				errorStack: err instanceof Error ? err.stack : undefined,
			});
		}

		return record;
	}

	public async resolve(
		queueId: MiLlmModerationQueue['id'],
		moderator: MiUser,
		params?: {
			moderationNote?: string;
		},
	): Promise<void> {
		const queue = await this.llmModerationQueueRepository.findOneBy({ id: queueId });
		if (!queue) {
			throw new ApiError(noSuchLlmModerationQueueError);
		}
		const nextNote = params?.moderationNote ?? queue.moderationNote;

		await this.llmModerationQueueRepository.update(queue.id, {
			resolved: true,
			assigneeId: moderator.id,
			moderationNote: nextNote,
		});
	}

	public async update(
		queueId: MiLlmModerationQueue['id'],
		params: {
			moderationNote?: string;
		},
		moderator: MiUser,
	): Promise<void> {
		const queue = await this.llmModerationQueueRepository.findOneBy({ id: queueId });
		if (!queue) {
			throw new ApiError(noSuchLlmModerationQueueError);
		}

		await this.llmModerationQueueRepository.update(queue.id, {
			moderationNote: params.moderationNote,
			assigneeId: moderator.id,
		});
	}

	private async notifyModerators(queue: MiLlmModerationQueue): Promise<void> {
		const moderatorIds = await this.roleService.getModeratorIds({
			includeAdmins: true,
			includeRoot: true,
			excludeExpire: true,
		});

		if (moderatorIds.length === 0) return;

		for (const moderatorId of moderatorIds) {
			this.globalEventService.publishAdminStream(
				moderatorId,
				'newLlmModerationQueueItem',
				{
					id: queue.id,
					noteId: queue.noteId,
					noteUserId: queue.noteUserId,
					flaggedCategories: queue.flaggedCategories,
				},
			);
			this.notificationService.createNotification(moderatorId, 'llmModerationQueue', {});
		}
	}

	public async fetchByIds(ids: MiLlmModerationQueue['id'][]): Promise<MiLlmModerationQueue[]> {
		return await this.llmModerationQueueRepository.findBy({ id: In(ids) });
	}
}
