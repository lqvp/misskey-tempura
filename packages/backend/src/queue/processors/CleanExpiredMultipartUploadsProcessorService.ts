/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import { LessThan } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { Config } from '@/config.js';
import Logger from '@/logger.js';
import type { MultipartUploadsRepository } from '@/models/_.js';
import { QueueLoggerService } from '../QueueLoggerService.js';

/**
 * マルチパートアップロードの期限切れによる一時ファイルの削除を担当するプロセッサー
 */
@Injectable()
export class CleanExpiredMultipartUploadsProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.multipartUploadsRepository)
		private multipartUploadsRepository: MultipartUploadsRepository,

		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger;
	}

	/**
	 * 期限切れマルチパートアップロードを検索し、関連する一時ファイルを削除
	 */
	@bindThis
	public async process(): Promise<void> {
		this.logger.info('Cleaning expired multipart uploads...');

		// 期限切れのマルチパートアップロードを検索
		const expiredUploads = await this.multipartUploadsRepository.find({
			where: {
				expiresAt: LessThan(new Date()),
			},
		});

		this.logger.info(`Found ${expiredUploads.length} expired multipart uploads`);

		let deletedCount = 0;
		let failedCount = 0;

		// 各期限切れアップロードの処理
		for (const upload of expiredUploads) {
			try {
				// 一時ファイルをクリーンアップ
				const partDir = `/tmp/misskey_multipart_${upload.id}`;
				if (fs.existsSync(partDir)) {
					// パートファイルの削除
					for (let i = 1; i <= upload.totalParts; i++) {
						const partPath = `${partDir}/part_${i}`;
						if (fs.existsSync(partPath)) {
							fs.unlinkSync(partPath);
						}
					}
					// ディレクトリの削除
					fs.rmdirSync(partDir);
					this.logger.info(`Cleaned up temporary files for expired upload: ${upload.id}`);
				}

				// データベースからアップロードレコードを削除
				await this.multipartUploadsRepository.delete(upload.id);
				deletedCount++;
			} catch (err) {
				this.logger.error(`Failed to clean up expired upload ${upload.id}:`, err as Error);
				failedCount++;
			}
		}

		// 結果ログ
		this.logger.info(`Cleaned up ${deletedCount} expired multipart uploads with ${failedCount} failures`);
	}
}
