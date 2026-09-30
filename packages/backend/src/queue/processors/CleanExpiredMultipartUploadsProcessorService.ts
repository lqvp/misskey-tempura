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
import {
	getLegacyMultipartStagingDir,
	getMultipartStagingDir,
	getMultipartStagingRoot,
	LEGACY_MULTIPART_STAGING_ROOT,
	LEGACY_MULTIPART_STAGING_PREFIX,
} from '@/misc/multipart-staging.js';
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
				// 先にレコードを削除してからスティージングを消す。
				// 逆順だと、削除済みのセッションへタイムスリップしたパート書き込みが
				// ディレクトリを再生成し、レコードのない孤立バイトとして
				// クォータ集計とクリーンアップの両方から逃れてしまう
				// (パート書き込み側はクォータロック取得後の再検証で同じ競合を断つ)
				await this.multipartUploadsRepository.delete(upload.id);

				// 一時ファイルをクリーンアップ（新旧どちらのスティージングディレクトリも削除する）
				let cleanedAny = false;
				for (const partDir of [getMultipartStagingDir(this.config.multipartTempDir, upload.id), getLegacyMultipartStagingDir(upload.id)]) {
					if (fs.existsSync(partDir)) {
						fs.rmSync(partDir, { recursive: true, force: true });
						cleanedAny = true;
					}
				}
				if (cleanedAny) {
					this.logger.info(`Cleaned up temporary files for expired upload: ${upload.id}`);
				}

				deletedCount++;
			} catch (err) {
				this.logger.error(`Failed to clean up expired upload ${upload.id}:`, err as Error);
				failedCount++;
			}
		}

		// 孤立スティージングの再回収: レコードが既に存在しないディレクトリで、
		// 更新時刻が期限切れ時刻よりさらに古いものは書き込み競合では再生成され得ない
		// ため安全に削除できる
		const orphanCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
		let orphanCount = 0;
		for (const [dir, uploadId] of this.listStagingUploadDirs()) {
			try {
				const mtime = fs.statSync(dir).mtime;
				if (mtime >= orphanCutoff) continue;
				if (await this.multipartUploadsRepository.exists({ where: { id: uploadId } })) continue;
				fs.rmSync(dir, { recursive: true, force: true });
				orphanCount++;
				this.logger.info(`Reaped orphaned multipart staging dir: ${dir}`);
			} catch (err) {
				this.logger.error(`Failed to reap orphaned staging dir ${dir}:`, err as Error);
			}
		}
		if (orphanCount > 0) {
			this.logger.info(`Reaped ${orphanCount} orphaned multipart staging dirs`);
		}

		// 結果ログ
		this.logger.info(`Cleaned up ${deletedCount} expired multipart uploads with ${failedCount} failures`);
	}

	/**
	 * 新旧スティージングルートに存在するアップロードディレクトリを
	 * (ディレクトリパス, アップロードID) の組で列挙する
	 */
	@bindThis
	private listStagingUploadDirs(): [string, string][] {
		const out: [string, string][] = [];
		const roots: [string, string | null][] = [
			[getMultipartStagingRoot(this.config.multipartTempDir), null],
			[LEGACY_MULTIPART_STAGING_ROOT, LEGACY_MULTIPART_STAGING_PREFIX],
		];
		for (const [root, prefix] of roots) {
			let names: string[];
			try {
				names = fs.readdirSync(root);
			} catch {
				continue;
			}
			for (const name of names) {
				const dir = `${root}/${name}`;
				let uploadId: string;
				if (prefix != null) {
					if (!name.startsWith(prefix)) continue;
					uploadId = name.slice(prefix.length);
				} else {
					uploadId = name;
				}
				try {
					if (!fs.statSync(dir).isDirectory()) continue;
				} catch {
					continue;
				}
				out.push([dir, uploadId]);
			}
		}
		return out;
	}
}
