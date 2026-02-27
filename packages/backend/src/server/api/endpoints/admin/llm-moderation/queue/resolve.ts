/*
 * SPDX-FileCopyrightText: chan-mai and lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { LlmModerationQueueService } from '@/core/LlmModerationQueueService.js';
import { noSuchLlmModerationQueueError } from '@/core/errors/llm-moderation-queue.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:llm-moderation',

	errors: {
		noSuchLlmModerationQueue: noSuchLlmModerationQueueError,
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
		private llmModerationQueueService: LlmModerationQueueService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.llmModerationQueueService.resolve(ps.queueId, me, {
				moderationNote: ps.moderationNote ?? undefined,
			});
		});
	}
}
