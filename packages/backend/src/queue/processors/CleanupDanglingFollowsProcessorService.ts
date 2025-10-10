/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { FollowingsRepository, UsersRepository } from '@/models/_.js';
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
	public async process(job: Bull.Job<DbCleanupDanglingFollowsJobData>): Promise<string | void> {
		const { user } = job.data;
		this.logger.info(`Cleaning up dangling follow relationships for user ${user.id}...`);

		// ユーザーに関連するフォロー関係を一度に取得
		const relationships = await this.followingsRepository.find({
			where: [
				{ followerId: user.id },
				{ followeeId: user.id },
			],
			select: ['followerId', 'followeeId'],
		});

		const followingIds = relationships
			.filter(r => r.followerId === user.id)
			.map(r => r.followeeId);
		const followerIds = relationships
			.filter(r => r.followeeId === user.id)
			.map(r => r.followerId);

		const relatedUserIds = [...new Set([...followingIds, ...followerIds])];

		let deletedUsersCount = 0;
		let message: string;
		if (relatedUserIds.length > 0) {
			const BATCH_SIZE = 100; // 要検討？
			for (let i = 0; i < relatedUserIds.length; i += BATCH_SIZE) {
				const batch = relatedUserIds.slice(i, i + BATCH_SIZE);
				// 関連アカウントの中から削除済みのアカウントを特定
				const deletedUserIds = (await this.usersRepository.find({
					where: { id: In(batch), isDeleted: true },
					select: ['id'],
				})).map(u => u.id);

				if (deletedUserIds.length > 0) {
					deletedUsersCount += deletedUserIds.length;

					// より効率的な削除クエリ
					await this.followingsRepository.delete([
						{ followerId: user.id, followeeId: In(deletedUserIds) },
						{ followeeId: user.id, followerId: In(deletedUserIds) },
					]);
				}
			}
		}

		// トランザクションでデータの整合性を保証
		await this.followingsRepository.manager.transaction(async manager => {
			// ダングリングフォローの削除 (あらかじめ danglingFollows を取得している想定)
			if (deletedUsersCount > 0 && danglingFollows.length > 0) {
				const idsToDelete = danglingFollows.map(f => f.id);
				await manager.delete('followings', idsToDelete);
			}

			// ユーザーのカウンターを再計算
			const followingCount = await manager.count('followings', { followerId: user.id });
			const followersCount = await manager.count('followings', { followeeId: user.id });
			await manager.update('users', user.id, {
				followingCount,
				followersCount,
			});
		});

		if (deletedUsersCount > 0) {
			message = `Cleaned up relationships with ${deletedUsersCount} deleted users for user ${user.id}.`;
		} else {
			message = `No dangling relationships to clean up for user ${user.id}.`;
		}
		this.logger.succ(message);

		// 通知作成時の失敗を拾ってログに記録
		try {
			this.notificationService.createNotification(user.id, 'cleanupDanglingFollowsCompleted', {
				count: deletedUsersCount.toString(),
			});
		} catch (error) {
			this.logger.warn(`Failed to create notification for user ${user.id}:`, error);
		}

		return message;
	}
}
