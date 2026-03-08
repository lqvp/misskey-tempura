/*
 * SPDX-FileCopyrightText: chan-mai and lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { LlmModerationQueueRepository, MiLlmModerationQueue, MiUser } from '@/models/_.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import { IdService } from '@/core/IdService.js';
import type { Packed } from '@/misc/json-schema.js';
import { bindThis } from '@/decorators.js';
import { NoteEntityService } from './NoteEntityService.js';
import { UserEntityService } from './UserEntityService.js';

async function nullIfEntityNotFound<T>(promise: Promise<T>): Promise<T | null> {
	try {
		return await promise;
	} catch (err) {
		if (err instanceof EntityNotFoundError) {
			return null;
		}
		throw err;
	}
}

@Injectable()
export class LlmModerationQueueEntityService {
	constructor(
		@Inject(DI.llmModerationQueueRepository)
		private llmModerationQueueRepository: LlmModerationQueueRepository,

		private noteEntityService: NoteEntityService,
		private userEntityService: UserEntityService,
		private idService: IdService,
	) {
	}

	@bindThis
	public async pack(
		src: MiLlmModerationQueue['id'] | MiLlmModerationQueue,
		me?: { id: MiUser['id'] } | null,
	): Promise<Packed<'LlmModerationQueue'>> {
		const queue = typeof src === 'object' ? src : await this.llmModerationQueueRepository.findOneByOrFail({ id: src });

		const note = await nullIfEntityNotFound(
			this.noteEntityService.pack(queue.noteId, me, {
				detail: true,
				skipHide: true,
			}),
		);

		const noteUser = await nullIfEntityNotFound(
			this.userEntityService.pack(queue.noteUserId, null, { schema: 'UserDetailedNotMe' }),
		);

		const assignee = queue.assigneeId
			? await nullIfEntityNotFound(
				this.userEntityService.pack(queue.assignee ?? queue.assigneeId, null, { schema: 'UserDetailedNotMe' }),
			)
			: null;

		return await awaitAll({
			id: queue.id,
			createdAt: this.idService.parse(queue.id).date.toISOString(),
			noteId: queue.noteId,
			note: note ?? null,
			noteUserId: queue.noteUserId,
			noteUser: noteUser ?? null,
			noteUserHost: queue.noteUserHost,
			noteVisibility: queue.noteVisibility,
			isRemote: queue.isRemote,
			provider: queue.provider,
			model: queue.model,
			flaggedCategories: queue.flaggedCategories,
			categoryScores: queue.categoryScores,
			resolved: queue.resolved,
			assigneeId: queue.assigneeId,
			assignee: assignee ?? null,
			moderationNote: queue.moderationNote,
		});
	}

	@bindThis
	public async packMany(
		queues: MiLlmModerationQueue[],
		me?: { id: MiUser['id'] } | null,
	): Promise<Packed<'LlmModerationQueue'>[]> {
		return await Promise.all(queues.map(queue => this.pack(queue, me)));
	}
}
