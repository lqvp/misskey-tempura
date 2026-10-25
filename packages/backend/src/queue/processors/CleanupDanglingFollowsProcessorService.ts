/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In, MoreThan } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { FollowingsRepository, UsersRepository } from '@/models/_.js';
import { MiFollowing } from '@/models/Following.js';
import { MiUser } from '@/models/User.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { NotificationService } from '@/core/NotificationService.js';
import { CacheService } from '@/core/CacheService.js';
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
		private cacheService: CacheService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('cleanup-dangling-follows');
	}

	@bindThis
	public async process(job: Bull.Job<DbCleanupDanglingFollowsJobData>): Promise<string> {
		const { user } = job.data;
		this.logger.info(`Cleaning up dangling follow relationships for user ${user.id} ...`);

		// 自分がフォローしている/されている関係をキーセットページネーションで走査する
		// (関係が多いユーザーで全件を一度にメモリへ読み込まないため)
		const SCAN_BATCH = 500;
		const deletedUserIds = new Set<string>();
		let cursor: MiFollowing['id'] | null = null;
		while (true) {
			const relationships = await this.followingsRepository.find({
				where: [
					{ followerId: user.id, ...(cursor ? { id: MoreThan(cursor) } : {}) },
					{ followeeId: user.id, ...(cursor ? { id: MoreThan(cursor) } : {}) },
				],
				select: { id: true, followerId: true, followeeId: true },
				take: SCAN_BATCH,
				order: { id: 'ASC' },
			});

			const relatedUserIds = [...new Set(relationships.flatMap(r => [r.followerId, r.followeeId]))]
				.filter(id => id !== user.id);

			// 関連アカウントのうち、行が既に存在しないもの(削除処理完了済み)と削除済みフラグのもの(削除処理中)を特定
			const BATCH_SIZE = 100;
			for (let i = 0; i < relatedUserIds.length; i += BATCH_SIZE) {
				const batch = relatedUserIds.slice(i, i + BATCH_SIZE);
				const existing = await this.usersRepository.find({
					where: { id: In(batch) },
					select: { id: true, isDeleted: true },
				});
				const existingIds = new Set(existing.map(u => u.id));
				for (const u of existing) {
					if (u.isDeleted) deletedUserIds.add(u.id);
				}
				for (const id of batch) {
					if (!existingIds.has(id)) deletedUserIds.add(id);
				}
			}

			if (relationships.length < SCAN_BATCH) break;
			cursor = relationships.at(-1)?.id ?? null;
			if (cursor == null) break;
		}

		// 関係の削除とカウンターの再計算を同一トランザクションで行う
		// (DELETE文も分割し、1文あたりのbind数とロック範囲を抑える)
		const DELETE_CHUNK = 500;
		const deletedUserIdList = [...deletedUserIds];
		await this.followingsRepository.manager.transaction(async manager => {
			for (let i = 0; i < deletedUserIdList.length; i += DELETE_CHUNK) {
				const chunk = deletedUserIdList.slice(i, i + DELETE_CHUNK);
				await manager.delete(MiFollowing, [
					{ followerId: user.id, followeeId: In(chunk) },
					{ followeeId: user.id, followerId: In(chunk) },
				]);
			}

			const followingCount = await manager.count(MiFollowing, { where: { followerId: user.id } });
			const followersCount = await manager.count(MiFollowing, { where: { followeeId: user.id } });
			await manager.update(MiUser, user.id, { followingCount, followersCount });
		});

		// カウンタを直接UPDATEしたため、ユーザー実体キャッシュ上のfollowingCount/followersCountは
		// 古いままになる。次回アクセス時に再取得されるよう無効化する (自分の$i表示に直結するため)
		this.cacheService.userByIdCache.delete(user.id);
		this.cacheService.localUserByIdCache.delete(user.id);

		// 関係を直接DELETEしたためキャッシュ更新イベントは発火しない。明示的にリフレッシュする。
		// refreshはasyncで、失敗時に未処理のrejectを浮かせないよう必ず捕捉する。
		// 失敗してもクリーンアップ本体(DB)は完了済みで、キャッシュはTTLで自然回復するためジョブは失敗させない。
		try {
			await this.cacheService.userFollowingsCache.refresh(user.id);
		} catch (error) {
			this.logger.warn(`Failed to refresh followings cache for user ${user.id}:`, { error: String(error) });
		}

		const message = deletedUserIds.size > 0
			? `Cleaned up relationships with ${deletedUserIds.size} deleted users for user ${user.id}.`
			: `No dangling relationships to clean up for user ${user.id}.`;
		this.logger.succ(message);

		try {
			await this.notificationService.createNotification(user.id, 'cleanupDanglingFollowsCompleted', {
				count: deletedUserIds.size,
			});
		} catch (error) {
			this.logger.warn(`Failed to create notification for user ${user.id}:`, { error: String(error) });
		}

		return message;
	}
}
