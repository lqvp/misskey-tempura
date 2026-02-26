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
			id: '15a7c5d2-1533-44a6-9ff4-cfc40dce8a75',
			kind: 'server',
			httpStatusCode: 404,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		queueId: { type: 'string', format: 'misskey:id' },
		moderationNote: { type: 'string', nullable: true },
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

			await this.llmModerationQueueService.resolve(queue.id, me, {
				moderationNote: ps.moderationNote ?? undefined,
			});
		});
	}
}
