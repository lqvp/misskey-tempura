/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { createTemp } from '@/misc/create-temp.js';
import type { MultipartUploadsRepository } from '@/models/_.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { DriveService } from '@/core/DriveService.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	prohibitMoved: true,

	limit: {
		duration: ms('1hour'),
		max: 30,
	},

	kind: 'write:drive',

	description: 'Complete a multipart upload and create the final file.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'DriveFile',
	},

	errors: {
		noSuchMultipartUpload: {
			message: 'No such multipart upload.',
			code: 'NO_SUCH_MULTIPART_UPLOAD',
			id: '1d517256-8c3e-4d04-b342-816e8a0adb98',
		},
		multipartUploadNotComplete: {
			message: 'Not all parts have been uploaded.',
			code: 'MULTIPART_UPLOAD_NOT_COMPLETE',
			id: '32f1fbb2-a9ca-4d16-be1d-5b4832bb9538',
		},
		multipartUploadExpired: {
			message: 'The multipart upload has expired.',
			code: 'MULTIPART_UPLOAD_EXPIRED',
			id: '1c8f71a2-a080-4043-9caa-ca06eed63c25',
		},
		noFreeSpace: {
			message: 'No free space.',
			code: 'NO_FREE_SPACE',
			id: 'c6244ed2-a39a-4e1c-bf93-f0fbd7764fa6',
		},
		fileSizeMismatch: {
			message: 'File size mismatch.',
			code: 'FILE_SIZE_MISMATCH',
			id: 'a8b2c3d4-e5f6-7890-abcd-ef1234567890',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
	},
	required: ['id'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.multipartUploadsRepository)
		private multipartUploadsRepository: MultipartUploadsRepository,
		private driveFileEntityService: DriveFileEntityService,
		private driveService: DriveService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me, _1, _2, _3, ip, headers) => {
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

			// Check drive capacity before processing
			const policies = await this.roleService.getUserPolicies(me.id);
			const driveCapacity = 1024 * 1024 * policies.driveCapacityMb;
			const currentUsage = await this.driveFileEntityService.calcDriveUsageOf(me.id);

			console.log(`Multipart upload ${multipartUpload.id}: capacity=${driveCapacity}, usage=${currentUsage}, totalSize=${multipartUpload.totalSize}`);

			if (driveCapacity < currentUsage + multipartUpload.totalSize) {
				console.error(`Drive capacity exceeded: ${currentUsage + multipartUpload.totalSize} > ${driveCapacity}`);
				throw new ApiError(meta.errors.noFreeSpace);
			}

			// Verify that all parts have been uploaded regardless of completedParts counter
			const partDir = `/tmp/misskey_multipart_${multipartUpload.id}`;
			let allPartsExist = true;
			const missingParts = [];

			// Make sure the parts directory exists
			if (!fs.existsSync(partDir)) {
				allPartsExist = false;
			} else {
				// Check each part
				for (let i = 1; i <= multipartUpload.totalParts; i++) {
					const partPath = `${partDir}/part_${i}`;
					if (!fs.existsSync(partPath)) {
						allPartsExist = false;
						missingParts.push(i);
					}
				}
			}

			if (!allPartsExist) {
				console.error(`Multipart upload ${multipartUpload.id} is incomplete. Missing parts: ${missingParts.join(', ')}`);
				throw new ApiError(meta.errors.multipartUploadNotComplete);
			}

			// Create a temporary file for the complete file
			const [completeFilePath] = await createTemp();

			// Combine all parts using streams instead of loading into memory
			const writeStream = fs.createWriteStream(completeFilePath);

			try {
				// Process parts sequentially using streams
				for (let i = 1; i <= multipartUpload.totalParts; i++) {
					const partPath = `${partDir}/part_${i}`;

					// Use streaming instead of loading entire parts into memory
					await new Promise<void>((resolve, reject) => {
						const readStream = fs.createReadStream(partPath);
						readStream.on('error', (err) => {
							console.error(`Error reading part ${i}:`, err);
							reject(err);
						});

						// When this part is fully piped, resolve and move to next
						readStream.on('end', () => resolve());

						// Pipe the data without loading it fully into memory
						readStream.pipe(writeStream, { end: false });
					});
				}

				// Close the write stream after all parts are processed
				writeStream.end();

				// Wait for the write stream to finish
				await new Promise<void>((resolve, reject) => {
					writeStream.on('finish', resolve);
					writeStream.on('error', reject);
				});

				// Verify the actual file size matches the expected size
				const actualFileSize = fs.statSync(completeFilePath).size;
				if (actualFileSize !== multipartUpload.totalSize) {
					console.error(`File size mismatch: expected ${multipartUpload.totalSize}, got ${actualFileSize}`);
					throw new ApiError(meta.errors.fileSizeMismatch);
				}

				// Now upload the complete file to drive
				const fileName = multipartUpload.name ?? 'untitled';

				const driveFile = await this.driveService.addFile({
					user: me,
					path: completeFilePath,
					name: fileName,
					comment: multipartUpload.comment,
					folderId: multipartUpload.folderId,
					force: multipartUpload.force,
					sensitive: multipartUpload.isSensitive,
					requestIp: ip,
					requestHeaders: headers,
				});

				// Clean up temp files
				try {
					if (fs.existsSync(partDir)) {
						for (let i = 1; i <= multipartUpload.totalParts; i++) {
							const partPath = `${partDir}/part_${i}`;
							if (fs.existsSync(partPath)) {
								fs.unlinkSync(partPath);
							}
						}
						fs.rmdirSync(partDir);
					}
				} catch (e) {
					console.error('Failed to clean up multipart upload parts', e);
				}

				// Delete the multipart upload record
				await this.multipartUploadsRepository.delete({
					id: multipartUpload.id,
				});

				return await this.driveFileEntityService.pack(driveFile, { self: true });
			} catch (err) {
				// エラー発生時の追加処理（ログ記録など）
				console.error('Error completing multipart upload:', err);

				// Clean up temp files on error
				try {
					if (fs.existsSync(completeFilePath)) {
						fs.unlinkSync(completeFilePath);
					}
				} catch (cleanupErr) {
					console.error('Failed to clean up temporary file on error:', cleanupErr);
				}

				throw err;
			} finally {
				// 常に実行されるクリーンアップ処理
				try {
					writeStream.end();
					if (fs.existsSync(completeFilePath)) {
						fs.unlinkSync(completeFilePath);
					}
				} catch (e) {
					console.error('Failed to clean up temporary file', e);
				}
			}
		});
	}
}
