/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import type { FollowRequestHistoryRepository } from '@/models/_.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DI } from '@/di-symbols.js';
import { CacheService } from '@/core/CacheService.js';
import {
	applyBlockedUsersFilter,
	applyDefaultTypeCondition,
	applyTypeCondition,
	createDeleteQuery,
	mapHistories,
} from '@/core/HistoryUtils.js';

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

        private userEntityService: UserEntityService,
        private queryService: QueryService,
        private cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.delete) {
				const query = createDeleteQuery(
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
				case 'sent': applyTypeCondition(query, 'fromUserId', 'sent', me.id); break;
				case 'received': applyTypeCondition(query, 'toUserId', 'received', me.id); break;
				case 'approved': applyTypeCondition(query, 'toUserId', 'approved', me.id); break;
				case 'rejected': applyTypeCondition(query, 'toUserId', 'rejected', me.id); break;
				case 'wasApproved': applyTypeCondition(query, 'fromUserId', 'wasApproved', me.id); break;
				case 'wasRejected': applyTypeCondition(query, 'fromUserId', 'wasRejected', me.id); break;
				case 'wasBlocked': applyTypeCondition(query, 'fromUserId', 'wasBlocked', me.id); break;
				case 'wasUnBlocked': applyTypeCondition(query, 'fromUserId', 'wasUnBlocked', me.id); break;
				default: applyDefaultTypeCondition(query, me.id,
					['sent', 'wasApproved', 'wasRejected', 'wasBlocked', 'wasUnBlocked'],
					['received', 'approved', 'rejected']);
			}

			await applyBlockedUsersFilter(query, me, this.cacheService);

			const histories = await query
				.orderBy('history.timestamp', 'DESC')
				.take(ps.limit)
				.getMany();

			return mapHistories(histories, me, this.cacheService, this.userEntityService);
		});
	}
}
