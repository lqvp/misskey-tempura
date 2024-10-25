/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull, MoreThan, Not } from 'typeorm';
import { ListObjectsCommandInput } from '@aws-sdk/client-s3';
import { DI } from '@/di-symbols.js';
import type { MiDriveFile, DriveFilesRepository, UsersRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import { bindThis } from '@/decorators.js';
import { S3Service } from '@/core/S3Service.js';
import { MetaService } from '@/core/MetaService.js';
import type { MiRemoteUser, MiUser } from '@/models/User.js';
import { appendQuery, query } from '@/misc/prelude/url.js';
import type { Config } from '@/config.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';

@Injectable()
export class CleanRemoteFilesProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.config)
		private config: Config,

		private driveService: DriveService,
		private queueLoggerService: QueueLoggerService,
		private s3Service: S3Service,
		private metaService: MetaService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('clean-remote-files');
	}

	@bindThis
	public async process(job: Bull.Job<Record<string, unknown>>): Promise<void> {
		this.logger.info('Deleting cached remote files...');

		let deletedCount = 0;
		let cursor: MiDriveFile['id'] | null = null;

		while (true) {
			const files = await this.driveFilesRepository.find({
				where: {
					userHost: Not(IsNull()),
					isLink: false,
					...(cursor ? { id: MoreThan(cursor) } : {}),
				},
				take: 8,
				order: {
					id: 1,
				},
			});

			if (files.length === 0) {
				job.updateProgress(100);
				break;
			}

			cursor = files.at(-1)?.id ?? null;

			await Promise.all(files.map(file => this.driveService.deleteFileSync(file, true)));

			deletedCount += 8;

			const total = await this.driveFilesRepository.countBy({
				userHost: Not(IsNull()),
				isLink: false,
			});

			job.updateProgress(100 / total * deletedCount);
		}

		this.logger.succ('All cached remote files has been deleted.');
		await this.cleanOrphanedFiles();
		await this.fixAvatars();
	}

	@bindThis
	private async cleanOrphanedFiles(): Promise<void> {
		this.logger.info('Cleaning orphaned files...');
		let object_cursor: string | null = null;
		let delete_counter = 0;
		while (true) {
			const meta = await this.metaService.fetch();
			if (meta.objectStorageBucket == null) {
				break;
			}
			const param = {
				Bucket: meta.objectStorageBucket,
			} as ListObjectsCommandInput;

			if (object_cursor) {
				param.Marker = object_cursor;
			}

			const objects = await this.s3Service.list(meta, param);

			if (!objects.Contents) {
				break;
			}
			object_cursor = objects.Contents.at(-1)?.Key ?? null;
			const files = objects.Contents;
			files.forEach(async (v) => {
				if (!v.Key) {
					return;
				}
				const isInDb = await this.driveFilesRepository.exists(
					{ where: [
						{ accessKey: v.Key }, 
						{ webpublicAccessKey: v.Key }, 
						{ thumbnailAccessKey: v.Key },
					] },
				);
				if (!isInDb) {
					this.logger.debug(`Delete ${v.Key}`);
					delete_counter++;
					await this.s3Service.delete(meta, {
						Key: v.Key,
						Bucket: meta.objectStorageBucket ?? undefined,
					});
				}
			});

			if (!objects.IsTruncated) {
				break;
			}
		}
		this.logger.succ(`${delete_counter} orphaned files deleted.`);
	}

	@bindThis
	private async fixAvatars(): Promise<void> {
		this.logger.info('Start Update remote users avatar URLs...');

		let cursor: MiRemoteUser['id'] | null = null;
		let count = 0;
		while (true) {
			const users = await this.usersRepository.find({
				where: [{
					host: Not(IsNull()),
					avatarId: Not(IsNull()),
					...(cursor ? { id: MoreThan(cursor) } : {} ),
				}, {
					host: Not(IsNull()),
					bannerId: Not(IsNull()),
					...(cursor ? { id: MoreThan(cursor) } : {} ),
				}],
				take: 8,
				order: {
					id: 1,
				},
			});

			if (users.length === 0) {
				break;
			}
			cursor = users.at(-1)?.id ?? null;
			const results = await Promise.all(users.map(user => this.fixAvatar(user)));
			count += results.filter(res => res).length;
		}

		this.logger.succ(`Updated ${count} User's avatar/banner URL`);
	}

	/** return true when updated */
	@bindThis
	private async fixAvatar(user: MiUser | null): Promise<boolean> {
		const update: Partial<MiUser> = {};
		if (!user) return false;
		if (user.avatarId) {
			const avatarFile = await this.driveFilesRepository.findOneBy({ id: user.avatarId });
			if (avatarFile?.isLink && avatarFile.uri) {
				const avatarUrl = this.getProxiedUrl(avatarFile.uri, 'avatar');
				if (avatarUrl !== user.avatarUrl) {
					update.avatarUrl = avatarUrl;
				}
			}
		}
		if (user.bannerId) {
			const bannerFile = await this.driveFilesRepository.findOneBy({ id: user.bannerId });
			if (bannerFile?.isLink && bannerFile.uri) {
				const bannerUrl = this.getProxiedUrl(bannerFile.uri);
				if (bannerUrl !== user.bannerUrl) {
					update.bannerUrl = bannerUrl;
				}
			}
		}
		if (!update.avatarUrl && !update.bannerUrl) return false;

		// Update User Avatar / Banner URL
		try {
			this.logger.debug(`Update user to ${JSON.stringify(update)}`);
			await this.usersRepository.update({ id: user.id }, update);
			return true;
		} catch (err) {
			this.logger.warn(JSON.stringify(err));
			return false;
		}
	}

	@bindThis
	private getProxiedUrl(url: string, mode?: 'static' | 'avatar'): string {
		return appendQuery(
			`${this.config.mediaProxy}/${mode ?? 'image'}.webp`,
			query({
				url,
				...(mode ? { [mode]: '1' } : {}),
			}),
		);
	}
}
