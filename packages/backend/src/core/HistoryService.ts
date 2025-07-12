/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { SelectQueryBuilder, Brackets, Repository } from 'typeorm';
import { MiUser } from '@/models/User.js';
import { CacheService } from '@/core/CacheService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { MiFollowHistory } from '@/models/FollowHistory.js';
import { MiFollowRequestHistory } from '@/models/FollowRequestHistory.js';
import { RoleService } from '@/core/RoleService.js';
import { IdService } from '@/core/IdService.js';
import { DI } from '@/di-symbols.js';
import type { FollowHistoryRepository, FollowRequestHistoryRepository } from '@/models/_.js';

@Injectable()
export class HistoryService {
	constructor(
		private cacheService: CacheService,
		private userEntityService: UserEntityService,
		private roleService: RoleService,
		private idService: IdService,
		@Inject(DI.followHistoryRepository)
		private followHistoryRepository: FollowHistoryRepository,
		@Inject(DI.followRequestHistoryRepository)
		private followRequestHistoryRepository: FollowRequestHistoryRepository,
	) {}

	private async addHistoryEntry<
		TEntity extends MiFollowHistory | MiFollowRequestHistory,
	>(
		repository: Repository<TEntity>,
		type: TEntity['type'],
		fromUserId: string,
		toUserId: string,
	) {
		await repository.insert({
			id: this.idService.gen(),
			type: type,
			fromUserId,
			toUserId,
			timestamp: new Date(),
		} as any);
	}

	private async createHistory<
		TEntity extends MiFollowHistory | MiFollowRequestHistory,
	>(
		repository: Repository<TEntity>,
		userA: MiUser,
		userB: MiUser,
		typeA: TEntity['type'],
		typeB: TEntity['type'],
	) {
		const [policiesA, policiesB] = await Promise.all([
			this.roleService.getUserPolicies(userA.id),
			this.roleService.getUserPolicies(userB.id),
		]);

		const promises = [];

		if (this.userEntityService.isLocalUser(userA) && policiesA.canReadFollowHistory) {
			promises.push(this.addHistoryEntry(repository, typeA, userA.id, userB.id));
		}
		if (this.userEntityService.isLocalUser(userB) && policiesB.canReadFollowHistory) {
			promises.push(this.addHistoryEntry(repository, typeB, userA.id, userB.id));
		}

		await Promise.all(promises);
	}

	public async addFollowHistory(follower: MiUser, followee: MiUser) {
		await this.createHistory(this.followHistoryRepository, follower, followee, 'follow', 'wasFollow');
	}

	public async addUnfollowHistory(follower: MiUser, followee: MiUser) {
		await this.createHistory(this.followHistoryRepository, follower, followee, 'unFollow', 'wasUnFollow');
	}

	public async addBlockHistory(blocker: MiUser, blockee: MiUser) {
		await this.createHistory(this.followHistoryRepository, blocker, blockee, 'blocked', 'wasBlocked');
	}

	public async addUnblockHistory(blocker: MiUser, blockee: MiUser) {
		await this.createHistory(this.followHistoryRepository, blocker, blockee, 'unBlocked', 'wasUnBlocked');
	}

	public async addFollowRequestHistory(follower: MiUser, followee: MiUser) {
		await this.createHistory(this.followRequestHistoryRepository, follower, followee, 'sent', 'received');
	}

	public async addFollowRequestAcceptedHistory(follower: MiUser, followee: MiUser) {
		await this.createHistory(this.followRequestHistoryRepository, follower, followee, 'wasApproved', 'approved');
	}

	public async addFollowRequestRejectedHistory(follower: MiUser, followee: MiUser) {
		await this.createHistory(this.followRequestHistoryRepository, follower, followee, 'wasRejected', 'rejected');
	}

	createDeleteQuery(
		repository: Repository<MiFollowHistory | MiFollowRequestHistory>,
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

	applyTypeCondition(
		query: SelectQueryBuilder<any>,
		field: 'fromUserId' | 'toUserId',
		type: string,
		meId: string,
	) {
		query.andWhere(`history.${field} = :meId`, { meId })
			.andWhere('history.type = :type', { type });
	}

	applyDefaultTypeCondition(
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

	async applyBlockedUsersFilter(
		query: SelectQueryBuilder<any>,
		me: MiUser,
	) {
		const blockedUserIds = await this.cacheService.userBlockedCache.fetch(me.id);
		if (blockedUserIds.size > 0) {
			query.andWhere('fromUser.id NOT IN (:...blockedUserIds)', { blockedUserIds: Array.from(blockedUserIds) });
			query.andWhere('toUser.id NOT IN (:...blockedUserIds)', { blockedUserIds: Array.from(blockedUserIds) });
		}
	}

// Add a concrete type for history records
type HistoryRecord = {
    id: string;
    type: string;
    fromUser?: MiUser;
    fromUserId: string;
    toUser?: MiUser;
    toUserId: string;
    timestamp: Date;
};

async mapHistories(
    histories: HistoryRecord[],
    me: MiUser,
) {
    const userFollowings = await this.cacheService.userFollowingsCache.fetch(me.id);
    return Promise.all(histories.map(async (history) => ({
        id: history.id,
        type: history.type,
        fromUser: await this.userEntityService.pack(history.fromUser ?? history.fromUserId, me),
        toUser: await this.userEntityService.pack(history.toUser ?? history.toUserId, me),
        timestamp: history.timestamp.toISOString(),
        isFollowing: Object.hasOwn(userFollowings, history.fromUserId),
    })));
}
}
