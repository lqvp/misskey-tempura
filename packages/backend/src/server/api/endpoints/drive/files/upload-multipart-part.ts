/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import ms from 'ms';
import * as Redis from 'ioredis';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { MultipartUploadsRepository } from '@/models/_.js';
import type { Config } from '@/config.js';
import { ApiError } from '../../../error.js';
import {
	getUploadStagedBytes,
	resolveMultipartStagingDir,
	MULTIPART_STAGING_QUOTA_BYTES,
} from '@/misc/multipart-staging.js';
import { acquireDistributedLock } from '@/misc/distributed-lock.js';

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	prohibitMoved: true,

	// TODO: レートリミットを詳しく検討する
	limit: {
		duration: ms('1hour'),
		max: 1000,
	},

	requireFile: true,

	kind: 'write:drive',

	description: 'Upload a part of a multipart upload.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			id: {
				type: 'string',
				optional: false, nullable: false,
				format: 'id',
				example: 'xxxxxxxxxx',
			},
			partNumber: {
				type: 'integer',
				optional: false, nullable: false,
			},
			etag: {
				type: 'string',
				optional: false, nullable: false,
			},
		},
	},

	errors: {
		noSuchMultipartUpload: {
			message: 'No such multipart upload.',
			code: 'NO_SUCH_MULTIPART_UPLOAD',
			id: '1d517256-8c3e-4d04-b342-816e8a0adb98',
		},
		invalidPartNumber: {
			message: 'Invalid part number.',
			code: 'INVALID_PART_NUMBER',
			id: '5bb633c3-845a-4b05-9338-a07a86136193',
		},
		multipartUploadExpired: {
			message: 'The multipart upload has expired.',
			code: 'MULTIPART_UPLOAD_EXPIRED',
			id: '1c8f71a2-a080-4043-9caa-ca06eed63c25',
		},
		stagingQuotaExceeded: {
			message: 'The total size of staged uploads exceeds the allowed quota.',
			code: 'STAGING_QUOTA_EXCEEDED',
			id: '5f0a3b2e-7c41-4f02-9a6d-2e8b5c1d4a73',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
		partNumber: { type: 'integer', minimum: 1, maximum: 10000 },
	},
	required: ['id', 'partNumber'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.multipartUploadsRepository)
		private multipartUploadsRepository: MultipartUploadsRepository,

		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,
	) {
		super(meta, paramDef, async (ps, me, _, file, cleanup) => {
			try {
				// Find the multipart upload
				const multipartUpload = await this.multipartUploadsRepository.findOneBy({
					id: ps.id,
					userId: me.id,
				});

				if (!multipartUpload) {
					throw new ApiError(meta.errors.noSuchMultipartUpload);
				}

				// Check if the multipart upload has expired
				if (multipartUpload.expiresAt < new Date()) {
					throw new ApiError(meta.errors.multipartUploadExpired);
				}

				// Check if the part number is valid
				if (ps.partNumber < 1 || ps.partNumber > multipartUpload.totalParts) {
					throw new ApiError(meta.errors.invalidPartNumber);
				}

				// パート读写先は旧スティージングパスとの互換を保って解決する
				const partDir = resolveMultipartStagingDir(this.config.multipartTempDir, multipartUpload.id);
				const partPath = `${partDir}/part_${ps.partNumber}`;

				// Check if this part was already uploaded
				const partExists = fs.existsSync(partPath);

				// クォータ判定とパート保存をユーザー単位で直列化し、
				// 並行アップロードが同じ使用量に対してチェックを通過して
				// クォータ超過になるのを防ぐ
				const unlock = await acquireDistributedLock(this.redisClient, `multipart-quota:${me.id}`, 30 * 1000, 50, 100);
				try {
					// ロック待機中に期限切れクリーンアップや完了処理がスティージング
					// ディレクトリとレコードを削除した可能性がある。そのまま書き戻すと
					// DB レコードのない孤立ディレクトリになりクォータ集計から逃れるため、
					// ロック取得後にセッションの存在を再検証する
					if (!(await this.multipartUploadsRepository.exists({ where: { id: multipartUpload.id, userId: me.id } }))) {
						throw new ApiError(meta.errors.noSuchMultipartUpload);
					}

					// 新しいパートをスティージングに加えた合計がアカウントの
					// クォータを超えたら拒否する。既存パートの置換の場合は
					// そのバイト数を差し引く
					const userUploads = await this.multipartUploadsRepository.findBy({ userId: me.id });
					let stagedBytes = fs.statSync(file!.path).size;
					for (const upload of userUploads) {
						stagedBytes += getUploadStagedBytes(this.config.multipartTempDir, upload.id);
					}
					if (partExists) {
						try {
							stagedBytes -= fs.statSync(partPath).size;
						} catch {
							// existsSync と stat の間に消えたファイルはサイズ 0 扱い
						}
					}
					if (stagedBytes > MULTIPART_STAGING_QUOTA_BYTES) {
						throw new ApiError(meta.errors.stagingQuotaExceeded);
					}

					// Create part directory if it doesn't exist
					if (!fs.existsSync(partDir)) {
						fs.mkdirSync(partDir, { recursive: true });
					}

					// Move the uploaded file to the part path
					// （スティージング先が一時領域と別ファイルシステムの場合は EXDEV になるため copy+削除にフォールバックする）
					try {
						fs.renameSync(file!.path, partPath);
					} catch (err) {
						if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
							fs.copyFileSync(file!.path, partPath);
							fs.rmSync(file!.path, { force: true });
						} else {
							throw err;
						}
					}

					// Calculate ETag (MD5 hash would be ideal, but we'll just use a simple identifier for now)
					const etag = `part_${ps.partNumber}_${Date.now()}`;

					// Only increment completedParts if this is a new part
					if (!partExists) {
						// Use a database transaction to ensure atomic update and avoid race conditions
						await this.multipartUploadsRepository.manager.transaction(async transactionalEntityManager => {
							// Get the latest upload status within the transaction
							const currentUpload = await transactionalEntityManager.findOneBy(this.multipartUploadsRepository.target, {
								id: multipartUpload.id,
							});

							if (currentUpload) {
								await transactionalEntityManager.update(
									this.multipartUploadsRepository.target,
									{ id: multipartUpload.id },
									{ completedParts: currentUpload.completedParts + 1 },
								);
							}
						});
					}

					return {
						id: multipartUpload.id,
						partNumber: ps.partNumber,
						etag,
					};
				} finally {
					await unlock();
				}
			} catch (err) {
				if (file && cleanup) cleanup();
				throw err;
			}
		});
	}
}
