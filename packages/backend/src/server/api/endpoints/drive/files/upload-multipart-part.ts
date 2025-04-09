/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { MultipartUploadsRepository } from '@/models/_.js';
import { ApiError } from '../../../error.js';

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

				// Create part directory if it doesn't exist
				const partDir = `/tmp/misskey_multipart_${multipartUpload.id}`;
				if (!fs.existsSync(partDir)) {
					fs.mkdirSync(partDir, { recursive: true });
				}

				// Save part
				const partPath = `${partDir}/part_${ps.partNumber}`;

				// Check if this part was already uploaded
				const partExists = fs.existsSync(partPath);

				// Move the uploaded file to the part path
				fs.renameSync(file!.path, partPath);

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
			} catch (err) {
				if (file && cleanup) cleanup();
				throw err;
			}
		});
	}
}
