/*
 * SPDX-FileCopyrightText: chan-mai and lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { LlmModerationQueueRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { LlmModerationQueueService } from '@/core/LlmModerationQueueService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:llm-moderation',

	errors: {
		noSuchLlmModerationQueue: {
			message: 'No such LLM moderation queue item.',
			code: 'NO_SUCH_LLM_MODERATION_QUEUE',
			id: '20cf67f6-d17f-4d8c-b55f-7072fdc6ca64',
			kind: 'server',
			httpStatusCode: 404,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		queueId: { type: 'string', format: 'misskey:id' },
		moderationNote: { type: 'string' },
	},
	required: ['queueId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.llmModerationQueueRepository)
		private llmModerationQueueRepository: LlmModerationQueueRepository,
		private llmModerationQueueService: LlmModerationQueueService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const queue = await this.llmModerationQueueRepository.findOneBy({ id: ps.queueId });
			if (!queue) {
				throw new ApiError(meta.errors.noSuchLlmModerationQueue);
			}

			await this.llmModerationQueueService.update(queue.id, {
				moderationNote: ps.moderationNote,
			}, me);
		});
	}
}
