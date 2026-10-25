/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { FollowingsRepository, UsersRepository } from '@/models/_.js';
import { MiFollowing } from '@/models/Following.js';
import { MiUser } from '@/models/User.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { NotificationService } from '@/core/NotificationService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { DbCleanupDanglingFollowsJobData } from '../types.js';

@Injectable()
export class CleanupDanglingFollowsProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private queueLoggerService: QueueLoggerService,
		private notificationService: NotificationService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('cleanup-dangling-follows');
	}

	@bindThis
	public async process(job: Bull.Job<DbCleanupDanglingFollowsJobData>): Promise<string> {
		const { user } = job.data;
		this.logger.info(`Cleaning up dangling follow relationships for user ${user.id} ...`);

		// 自分がフォローしている/されている関係の相手をすべて取得
		const relationships = await this.followingsRepository.find({
			where: [
				{ followerId: user.id },
				{ followeeId: user.id },
			],
			select: { followerId: true, followeeId: true },
		});

		const relatedUserIds = [...new Set(relationships.flatMap(r => [r.followerId, r.followeeId]))]
			.filter(id => id !== user.id);

		// 関連アカウントのうち削除済みのものを特定
		const deletedUserIds = new Set<string>();
		const BATCH_SIZE = 100;
		for (let i = 0; i < relatedUserIds.length; i += BATCH_SIZE) {
			const batch = relatedUserIds.slice(i, i + BATCH_SIZE);
			const deleted = await this.usersRepository.find({
				where: { id: In(batch), isDeleted: true },
				select: { id: true },
			});
			for (const u of deleted) {
				deletedUserIds.add(u.id);
			}
		}

		// 関係の削除とカウンターの再計算を同一トランザクションで行う
		await this.followingsRepository.manager.transaction(async manager => {
			if (deletedUserIds.size > 0) {
				await manager.delete(MiFollowing, [
					{ followerId: user.id, followeeId: In([...deletedUserIds]) },
					{ followeeId: user.id, followerId: In([...deletedUserIds]) },
				]);
			}

			const followingCount = await manager.count(MiFollowing, { where: { followerId: user.id } });
			const followersCount = await manager.count(MiFollowing, { where: { followeeId: user.id } });
			await manager.update(MiUser, user.id, { followingCount, followersCount });
		});

		const message = deletedUserIds.size > 0
			? `Cleaned up relationships with ${deletedUserIds.size} deleted users for user ${user.id}.`
			: `No dangling relationships to clean up for user ${user.id}.`;
		this.logger.succ(message);

		try {
			this.notificationService.createNotification(user.id, 'cleanupDanglingFollowsCompleted', {
				count: deletedUserIds.size,
			});
		} catch (error) {
			this.logger.warn(`Failed to create notification for user ${user.id}:`, { error: String(error) });
		}

		return message;
	}
}
