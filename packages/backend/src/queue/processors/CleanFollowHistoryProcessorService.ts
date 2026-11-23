/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import type { FollowHistoryRepository, FollowRequestHistoryRepository } from '@/models/_.js';
import { QueueLoggerService } from '../QueueLoggerService.js';

// follow_history / follow_request_history の保持期間(日)。
// この期間より古いレコードは日次のクリーンアップジョブで削除される
const FOLLOW_HISTORY_RETENTION_DAYS = 365;

@Injectable()
export class CleanFollowHistoryProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.followHistoryRepository)
		private followHistoryRepository: FollowHistoryRepository,

		@Inject(DI.followRequestHistoryRepository)
		private followRequestHistoryRepository: FollowRequestHistoryRepository,

		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('clean-follow-history');
	}

	@bindThis
	public async process(): Promise<void> {
		const threshold = new Date(Date.now() - 1000 * 60 * 60 * 24 * FOLLOW_HISTORY_RETENTION_DAYS);

		// TypeORM の delete() は LIMIT を持たないため、
		// サブクエリで対象 id を限定してバッチ削除する(大量削除での長時間ロック防止)
		const BATCH_SIZE = 1000;
		let totalDeleted = 0;

		for (const repository of [this.followHistoryRepository, this.followRequestHistoryRepository] as const) {
			const tableName = repository.metadata.tableName;
			while (true) {
				const result = await repository.createQueryBuilder()
					.delete()
					.where(`id IN (SELECT id FROM ${tableName} WHERE "timestamp" < :threshold LIMIT :limit)`, { threshold, limit: BATCH_SIZE })
					.execute();
				const affected = result.affected ?? 0;
				if (affected === 0) break;
				totalDeleted += affected;
				if (affected < BATCH_SIZE) break;
			}
		}

		if (totalDeleted > 0) {
			this.logger.info(`Deleted ${totalDeleted} history records older than ${FOLLOW_HISTORY_RETENTION_DAYS} days`);
		}
	}
}
