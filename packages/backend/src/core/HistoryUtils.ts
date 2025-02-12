/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { SelectQueryBuilder, Brackets } from 'typeorm';
import { MiUser } from '@/models/User.js';
import { CacheService } from '@/core/CacheService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';

export function createDeleteQuery(
	repository: any,
	meId: string,
	fromTypes: string[],
	toTypes: string[],
) {
	return repository.createQueryBuilder()
		.delete()
		.from(repository.metadata.tableName)
		.where(new Brackets(qb => {
			qb.where(new Brackets(qb2 => {
				qb2.where('fromUserId = :meId', { meId })
					.andWhere('type IN (:...fromTypes)', { fromTypes });
			}))
				.orWhere(new Brackets(qb2 => {
					qb2.where('toUserId = :meId', { meId })
						.andWhere('type IN (:...toTypes)', { toTypes });
				}));
		}));
}

export function applyTypeCondition(
	query: SelectQueryBuilder<any>,
	field: 'fromUserId' | 'toUserId',
	type: string,
	meId: string,
) {
	query.andWhere(`history.${field} = :meId`, { meId })
		.andWhere('history.type = :type', { type });
}

export function applyDefaultTypeCondition(
	query: SelectQueryBuilder<any>,
	meId: string,
	fromTypes: string[],
	toTypes: string[],
) {
	query.andWhere(new Brackets(qb => {
		qb.where(new Brackets(qb2 => {
			qb2.where('history.fromUserId = :meId', { meId })
				.andWhere('history.type IN (:...fromTypes)', { fromTypes });
		}))
			.orWhere(new Brackets(qb2 => {
				qb2.where('history.toUserId = :meId', { meId })
					.andWhere('history.type IN (:...toTypes)', { toTypes });
			}));
	}));
}

export async function applyBlockedUsersFilter(
	query: SelectQueryBuilder<any>,
	me: MiUser,
	cacheService: CacheService,
) {
	const blockedUserIds = await cacheService.userBlockedCache.fetch(me.id);
	if (blockedUserIds.size > 0) {
		query.andWhere('fromUser.id NOT IN (:...blockedUserIds)', { blockedUserIds: Array.from(blockedUserIds) });
		query.andWhere('toUser.id NOT IN (:...blockedUserIds)', { blockedUserIds: Array.from(blockedUserIds) });
	}
}

export async function mapHistories(
	histories: any[],
	me: MiUser,
	cacheService: CacheService,
	userEntityService: UserEntityService,
) {
	const userFollowings = await cacheService.userFollowingsCache.fetch(me.id);
	return Promise.all(histories.map(async (history) => ({
		id: history.id,
		type: history.type,
		fromUser: await userEntityService.pack(history.fromUser ?? history.fromUserId, me),
		toUser: await userEntityService.pack(history.toUser ?? history.toUserId, me),
		timestamp: history.timestamp.toISOString(),
		isFollowing: Object.hasOwn(userFollowings, history.fromUserId),
	})));
}
