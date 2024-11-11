/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { ObjectStorageFileJobData } from '../types.js';

@Injectable()
export class ReDownloadRemoteFileProcessorService {
	private logger: Logger;

	constructor(
		private driveService: DriveService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('Re-cache-file');
	}

	@bindThis
	public async process(job: Bull.Job<ObjectStorageFileJobData>): Promise<string> {
		const fileId: string = job.data.key;
		this.logger.debug(`Re-Download Remote file: ${fileId}`);
		await this.driveService.reCacheFile(fileId);

		return 'Success';
	}
}
