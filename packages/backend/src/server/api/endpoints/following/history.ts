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

export const meta = {
	tags: ['following', 'account'],
	requireCredential: true,
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
					ref: 'UserDetailedNotMe',
				},
				toUser: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'UserDetailedNotMe',
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
	) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.delete) {
				await this.followHistoryRepository
					.createQueryBuilder()
					.delete()
					.from('follow_history')
					.where(new Brackets(qb => {
						qb.where(new Brackets(qb2 => {
							qb2.where('fromUserId = :meId', { meId: me.id })
								.andWhere('type IN (:...fromTypes)', {
									fromTypes: ['follow', 'unFollow', 'blocked', 'unBlocked'],
								});
						}))
							.orWhere(new Brackets(qb2 => {
								qb2.where('toUserId = :meId', { meId: me.id })
									.andWhere('type IN (:...toTypes)', {
										toTypes: ['wasFollow', 'wasUnFollow', 'wasBlocked', 'wasUnBlocked'],
									});
							}));
					}))
					.execute();

				return [];
			}

			const query = this.queryService.makePaginationQuery(
				this.followHistoryRepository.createQueryBuilder('history'),
				ps.sinceId,
				ps.untilId,
			)
				.leftJoinAndSelect('history.fromUser', 'fromUser')
				.leftJoinAndSelect('history.toUser', 'toUser');

			// タイプごとの適切なフィルタリング
			switch (ps.type) {
				case 'follow':
					query.andWhere('history.fromUserId = :meId', { meId: me.id })
						.andWhere('history.type = :type', { type: 'follow' });
					break;
				case 'unFollow':
					query.andWhere('history.fromUserId = :meId', { meId: me.id })
						.andWhere('history.type = :type', { type: 'unFollow' });
					break;
				case 'wasFollow':
					query.andWhere('history.toUserId = :meId', { meId: me.id })
						.andWhere('history.type = :type', { type: 'wasFollow' });
					break;
				case 'wasUnFollow':
					query.andWhere('history.toUserId = :meId', { meId: me.id })
						.andWhere('history.type = :type', { type: 'wasUnFollow' });
					break;
				case 'blocked':
					query.andWhere('history.fromUserId = :meId', { meId: me.id })
						.andWhere('history.type = :type', { type: 'blocked' });
					break;
				case 'unBlocked':
					query.andWhere('history.fromUserId = :meId', { meId: me.id })
						.andWhere('history.type = :type', { type: 'unBlocked' });
					break;
				case 'wasBlocked':
					query.andWhere('history.toUserId = :meId', { meId: me.id })
						.andWhere('history.type = :type', { type: 'wasBlocked' });
					break;
				case 'wasUnBlocked':
					query.andWhere('history.toUserId = :meId', { meId: me.id })
						.andWhere('history.type = :type', { type: 'wasUnBlocked' });
					break;
				default:
					query.andWhere(new Brackets(qb => {
						qb.where(new Brackets(qb2 => {
							qb2.where('history.fromUserId = :meId', { meId: me.id })
								.andWhere('history.type IN (:...fromTypes)', {
									fromTypes: ['follow', 'unFollow', 'blocked', 'unBlocked'],
								});
						}))
							.orWhere(new Brackets(qb2 => {
								qb2.where('history.toUserId = :meId', { meId: me.id })
									.andWhere('history.type IN (:...toTypes)', {
										toTypes: ['wasFollow', 'wasUnFollow', 'wasBlocked', 'wasUnBlocked'],
									});
							}));
					}));
					break;
			}

			const histories = await query
				.orderBy('history.timestamp', 'DESC')
				.take(ps.limit)
				.getMany();

			return await Promise.all(histories.map(async history => ({
				id: history.id,
				type: history.type,
				fromUser: await this.userEntityService.pack(history.fromUser ?? history.fromUserId, me, { schema: 'UserDetailed' }),
				toUser: await this.userEntityService.pack(history.toUser ?? history.toUserId, me, { schema: 'UserDetailed' }),
				timestamp: history.timestamp.toISOString(),
			})));
		});
	}
}
