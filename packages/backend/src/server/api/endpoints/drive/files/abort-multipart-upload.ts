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
import { acquireDistributedLock } from '@/misc/distributed-lock.js';
import { getLegacyMultipartStagingDir, getMultipartStagingDir } from '@/misc/multipart-staging.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	limit: {
		duration: ms('1hour'),
		max: 100,
	},

	kind: 'write:drive',

	description: 'Abort a multipart upload and discard its uploaded parts.',

	errors: {
		noSuchMultipartUpload: {
			message: 'No such multipart upload.',
			code: 'NO_SUCH_MULTIPART_UPLOAD',
			id: '0a16c2a8-8962-465b-9cdb-e9e327443e57',
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

		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,
	) {
		super(meta, paramDef, async (ps, me) => {
			// パートの書き込みと容量の集計は同じロックで直列化しているので、同じロックを取ってから消す
			const unlock = await acquireDistributedLock(this.redisClient, `multipart-quota:${me.id}`, 30 * 1000, 300, 100);
			try {
				const result = await this.multipartUploadsRepository.delete({ id: ps.id, userId: me.id });
				if (!result.affected) {
					throw new ApiError(meta.errors.noSuchMultipartUpload);
				}

				// complete と同じく、レコードを先に消してから新旧どちらのスティージングディレクトリも消す
				for (const dir of [getMultipartStagingDir(this.config.multipartTempDir, ps.id), getLegacyMultipartStagingDir(ps.id)]) {
					await fs.promises.rm(dir, { recursive: true, force: true });
				}
			} finally {
				await unlock();
			}
		});
	}
}
