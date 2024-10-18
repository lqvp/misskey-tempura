/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource, IsNull, LessThan, MoreThan, Not } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { DriveFilesRepository, UsersRepository } from '@/models/_.js';
import { MiUser, MiDriveFile } from '@/models/_.js';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import { bindThis } from '@/decorators.js';
import { MetaService } from '@/core/MetaService.js';
import { appendQuery, query } from '@/misc/prelude/url.js';
import type { Config } from '@/config.js';
import { QueueLoggerService } from '../QueueLoggerService.js';

@Injectable()
export class CleanExpiredRemoteFilesProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.config)
		private config: Config,

		@Inject(DI.db)
		private db: DataSource,

		private driveService: DriveService,
		private queueLoggerService: QueueLoggerService,
		private metaService: MetaService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('clean-expired-remote-files');
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
	
	@bindThis
	private updateAvatarUrl(userIds: Set<MiUser['id']>) {
		return new Promise<void>(async (resolve) => {
			let counter = 0;

			for (const uid of userIds) {
				try {
					await this.db.transaction(async (entityManager) => {
						const user = await entityManager.findOneBy(MiUser, { id: uid });
						if (!user) return;
						const userAvatarFile = user.avatarId != null ? await entityManager.findOneBy(MiDriveFile, { id: user.avatarId }) : null;
						const userBannerFile = user.bannerId != null ? await entityManager.findOneBy(MiDriveFile, { id: user.bannerId }) : null;
						const update: Partial<MiUser> = {};
						if (userAvatarFile?.isLink) {
							update.avatarUrl = userAvatarFile.uri != null ? this.getProxiedUrl(userAvatarFile.uri, 'avatar') : null;
						}
						if (userBannerFile?.isLink) {
							update.bannerUrl = userBannerFile.uri != null ? this.getProxiedUrl(userBannerFile.uri) : null;
						}
						
						if (update.avatarUrl != null || update.bannerUrl != null) {
							counter++;
							this.logger.debug(`Update User ${user.id}'s avatar / banner URL...: ${JSON.stringify(update)}`);
							await entityManager.update(MiUser, { id: user.id }, update);
						}
					});
				} catch (err) {
					this.logger.warn(JSON.stringify(err));
				}
			}
			
			this.logger.info(`Updated ${counter} avatar/banner URL`);
			resolve();
		});
	}
	@bindThis
	public async process(): Promise<void> {
		const meta = await this.metaService.fetch();
		const cache_days = meta.objectStorageCacheDays;
		if (cache_days == null) {
			this.logger.debug('skip clean (disabled)');
			return;
		}
		this.logger.info('Clean expired remote files...');

		let deletedCount = 0;
		let cursor: MiDriveFile['id'] | null = null;
		const userIds = new Set<MiUser['id']>;

		const expireDate = new Date(Date.now() - (cache_days * 24 * 60 * 60 * 1000));
		while (true) {
			const files = await this.driveFilesRepository.find({
				where: {
					userHost: Not(IsNull()),
					cachedAt: LessThan(expireDate),
					isLink: false,
					...(cursor ? { id: MoreThan(cursor) } : {}),
				},
				take: 8,
				order: {
					id: 1,
				},
			});

			if (files.length === 0) {
				break;
			}

			cursor = files.at(-1)?.id ?? null;

			await Promise.all(files.map(file => {
				if (file.userId) {
					userIds.add(file.userId);
				}
			}));
			await Promise.all(files.map(file => this.driveService.deleteFileSync(file, true)));

			deletedCount += 8;
		}
		await this.updateAvatarUrl(userIds);
		this.logger.succ(`${deletedCount} cached remote files has been deleted.`);
	}
}
