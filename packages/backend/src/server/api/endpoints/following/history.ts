/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import type { FollowHistoryRepository } from '@/models/_.js';
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
					enum: ['follow', 'unFollow', 'wasFollow', 'wasUnFollow', 'blocked', 'unBlocked', 'wasBlocked', 'wasUnBlocked'],
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
			enum: ['follow', 'unFollow', 'wasFollow', 'wasUnFollow', 'blocked', 'unBlocked', 'wasBlocked', 'wasUnBlocked'],
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
        @Inject(DI.followHistoryRepository)
        private followHistoryRepository: FollowHistoryRepository,

        private userEntityService: UserEntityService,
        private queryService: QueryService,
        private cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.delete) {
				await this.cacheService.userFollowingsCache.delete(me.id);
				const query = createDeleteQuery(
					this.followHistoryRepository,
					me.id,
					['follow', 'unFollow', 'blocked', 'unBlocked'],
					['wasFollow', 'wasUnFollow', 'wasBlocked', 'wasUnBlocked'],
				);
				await query.execute();
				return [];
			}

			const query = this.queryService.makePaginationQuery(
				this.followHistoryRepository.createQueryBuilder('history'),
				ps.sinceId,
				ps.untilId,
			)
				.leftJoinAndSelect('history.fromUser', 'fromUser')
				.leftJoinAndSelect('history.toUser', 'toUser');

			switch (ps.type) {
				case 'follow': applyTypeCondition(query, 'fromUserId', 'follow', me.id); break;
				case 'unFollow': applyTypeCondition(query, 'fromUserId', 'unFollow', me.id); break;
				case 'wasFollow': applyTypeCondition(query, 'toUserId', 'wasFollow', me.id); break;
				case 'wasUnFollow': applyTypeCondition(query, 'toUserId', 'wasUnFollow', me.id); break;
				case 'blocked': applyTypeCondition(query, 'fromUserId', 'blocked', me.id); break;
				case 'unBlocked': applyTypeCondition(query, 'fromUserId', 'unBlocked', me.id); break;
				case 'wasBlocked': applyTypeCondition(query, 'toUserId', 'wasBlocked', me.id); break;
				case 'wasUnBlocked': applyTypeCondition(query, 'toUserId', 'wasUnBlocked', me.id); break;
				default: applyDefaultTypeCondition(query, me.id,
					['follow', 'unFollow', 'blocked', 'unBlocked'],
					['wasFollow', 'wasUnFollow', 'wasBlocked', 'wasUnBlocked']);
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
