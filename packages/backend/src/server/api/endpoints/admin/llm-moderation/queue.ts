/*
 * SPDX-FileCopyrightText: chan-mai and lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { LlmModerationQueueRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { LlmModerationQueueEntityService } from '@/core/entities/LlmModerationQueueEntityService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:llm-moderation',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'LlmModerationQueue',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		state: { type: 'string', enum: ['all', 'resolved', 'unresolved'], default: 'unresolved' },
		origin: { type: 'string', enum: ['combined', 'local', 'remote'], default: 'combined' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.llmModerationQueueRepository)
		private llmModerationQueueRepository: LlmModerationQueueRepository,

		private llmModerationQueueEntityService: LlmModerationQueueEntityService,
		private queryService: QueryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.queryService.makePaginationQuery(
				this.llmModerationQueueRepository.createQueryBuilder('queue'),
				ps.sinceId,
				ps.untilId,
				ps.sinceDate,
				ps.untilDate,
			);

			switch (ps.state) {
				case 'resolved':
					query.andWhere('queue.resolved = TRUE');
					break;
				case 'unresolved':
					query.andWhere('queue.resolved = FALSE');
					break;
			}

			switch (ps.origin) {
				case 'local':
					query.andWhere('queue.isRemote = FALSE');
					break;
				case 'remote':
					query.andWhere('queue.isRemote = TRUE');
					break;
			}

			const queues = await query.limit(ps.limit).getMany();

			return await this.llmModerationQueueEntityService.packMany(queues, me);
		});
	}
}
