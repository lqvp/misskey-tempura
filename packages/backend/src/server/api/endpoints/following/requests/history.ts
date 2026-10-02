/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import type { FollowRequestHistoryRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { HistoryService } from '@/core/HistoryService.js';

export const meta = {
	tags: ['following', 'account'],
	requireCredential: true,
	requireRolePolicy: 'canReadFollowHistory',
	kind: 'read:following',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: {
					type: 'string',
					optional: false, nullable: false,
					format: 'id',
				},
				type: {
					type: 'string',
					optional: false, nullable: true,
					enum: ['sent', 'received', 'approved', 'rejected', 'wasApproved', 'wasRejected', 'wasBlocked', 'wasUnBlocked'],
					description: 'Filter by type of action',
				},
				fromUser: {
					type: 'object',
					optional: false, nullable: false,
				},
				toUser: {
					type: 'object',
					optional: false, nullable: false,
				},
				timestamp: {
					type: 'string',
					optional: false, nullable: false,
					format: 'date-time',
				},
			},
		},
	},

	errors: {
		invalidType: {
			message: 'Invalid type.',
			code: 'INVALID_TYPE',
			id: '1d7645e6-2b6d-4635-b0d8-68b6b259c8c0',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		type: {
			type: 'string',
			enum: ['sent', 'received', 'approved', 'rejected', 'wasApproved', 'wasRejected', 'wasBlocked', 'wasUnBlocked'],
			nullable: true,
			description: 'Filter by type of action',
		},
		sinceId: {
			type: 'string',
			format: 'misskey:id',
			description: 'Get history after this ID',
		},
		untilId: {
			type: 'string',
			format: 'misskey:id',
			description: 'Get history before this ID',
		},
		limit: {
			type: 'integer',
			minimum: 1,
			maximum: 100,
			default: 30,
			description: 'Number of histories to get',
		},
		delete: {
			type: 'boolean',
			default: false,
			description: 'Delete all histories',
		},
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.followRequestHistoryRepository)
		private followRequestHistoryRepository: FollowRequestHistoryRepository,

		private queryService: QueryService,
		private historyService: HistoryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.delete) {
				const query = this.historyService.createDeleteQuery(
					this.followRequestHistoryRepository,
					me.id,
					['sent', 'wasApproved', 'wasRejected', 'wasBlocked', 'wasUnBlocked'],
					['received', 'approved', 'rejected'],
				);
				await query.execute();
				return [];
			}

			const query = this.queryService.makePaginationQuery(
				this.followRequestHistoryRepository.createQueryBuilder('history'),
				ps.sinceId,
				ps.untilId,
			)
				.leftJoinAndSelect('history.fromUser', 'fromUser')
				.leftJoinAndSelect('history.toUser', 'toUser');

			switch (ps.type) {
				case 'sent': this.historyService.applyTypeCondition(query, 'fromUserId', 'sent', me.id); break;
				case 'received': this.historyService.applyTypeCondition(query, 'toUserId', 'received', me.id); break;
				case 'approved': this.historyService.applyTypeCondition(query, 'toUserId', 'approved', me.id); break;
				case 'rejected': this.historyService.applyTypeCondition(query, 'toUserId', 'rejected', me.id); break;
				case 'wasApproved': this.historyService.applyTypeCondition(query, 'fromUserId', 'wasApproved', me.id); break;
				case 'wasRejected': this.historyService.applyTypeCondition(query, 'fromUserId', 'wasRejected', me.id); break;
				case 'wasBlocked': this.historyService.applyTypeCondition(query, 'fromUserId', 'wasBlocked', me.id); break;
				case 'wasUnBlocked': this.historyService.applyTypeCondition(query, 'fromUserId', 'wasUnBlocked', me.id); break;
				default: this.historyService.applyDefaultTypeCondition(query, me.id,
					['sent', 'wasApproved', 'wasRejected', 'wasBlocked', 'wasUnBlocked'],
					['received', 'approved', 'rejected']);
			}

			await this.historyService.applyBlockedUsersFilter(query, me);

			const histories = await query
				.orderBy('history.timestamp', 'DESC')
				.take(ps.limit)
				.getMany();

			return this.historyService.mapHistories(histories, me);
		});
	}
}
