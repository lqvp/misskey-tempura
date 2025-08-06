/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { MoreThan } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { DriveFilesRepository, FollowingsRepository, NotesRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiNote } from '@/models/Note.js';
import { EmailService } from '@/core/EmailService.js';
import { bindThis } from '@/decorators.js';
import { SearchService } from '@/core/SearchService.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import type { MiFollowing } from '@/models/Following.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { DbUserDeleteJobData } from '../types.js';

@Injectable()
export class DeleteAccountProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private driveService: DriveService,
		private emailService: EmailService,
		private queueLoggerService: QueueLoggerService,
		private searchService: SearchService,
		private userFollowingService: UserFollowingService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('delete-account');
	}

	@bindThis
	public async process(job: Bull.Job<DbUserDeleteJobData>): Promise<string | void> {
		this.logger.info(`Deleting account of ${job.data.user.id} ...`);

		const user = await this.usersRepository.findOneBy({ id: job.data.user.id });
		if (user == null) {
			return;
		}

		{ // Unfollow all
			let cursor: MiFollowing['id'] | null = null;
			const BATCH_SIZE = 100;

			while (true) {
				const relations = await this.followingsRepository.find({
					where: {
						followerId: user.id,
						...(cursor ? { id: MoreThan(cursor) } : {}),
					},
					take: BATCH_SIZE,
					order: {
						id: 'ASC',
					},
				});

				if (relations.length === 0) {
					break;
				}

				cursor = relations[relations.length - 1].id;

				for (const f of relations) {
					const followee = await this.usersRepository.findOneBy({ id: f.followeeId });
					if (followee) {
						try {
							await this.userFollowingService.unfollow(user, followee, true);
						} catch (error) {
							this.logger.warn(error as any);
						}
					}
				}
			}
			this.logger.succ('All of following deleted');
		}

		{ // Unfollowed by all
			let cursor: MiFollowing['id'] | null = null;
			const BATCH_SIZE = 100;

			while (true) {
				const relations = await this.followingsRepository.find({
					where: {
						followeeId: user.id,
						...(cursor ? { id: MoreThan(cursor) } : {}),
					},
					take: BATCH_SIZE,
					order: {
						id: 'ASC',
					},
				});

				if (relations.length === 0) {
					break;
				}

				cursor = relations[relations.length - 1].id;

				for (const f of relations) {
					const follower = await this.usersRepository.findOneBy({ id: f.followerId });
					if (follower) {
						try {
							await this.userFollowingService.unfollow(follower, user, true);
						} catch (error) {
							this.logger.warn(error as any);
						}
					}
				}
			}
			this.logger.succ('All of followers deleted');
		}

		{ // Delete notes
			let cursor: MiNote['id'] | null = null;

			while (true) {
				const notes = await this.notesRepository.find({
					where: {
						userId: user.id,
						...(cursor ? { id: MoreThan(cursor) } : {}),
					},
					take: 100,
					order: {
						id: 1,
					},
				}) as MiNote[];

				if (notes.length === 0) {
					break;
				}

				cursor = notes.at(-1)?.id ?? null;

				await this.notesRepository.delete(notes.map(note => note.id));

				for (const note of notes) {
					await this.searchService.unindexNote(note);
				}
			}

			this.logger.succ('All of notes deleted');
		}

		{ // Delete files
			let cursor: MiDriveFile['id'] | null = null;

			while (true) {
				const files = await this.driveFilesRepository.find({
					where: {
						userId: user.id,
						...(cursor ? { id: MoreThan(cursor) } : {}),
					},
					take: 10,
					order: {
						id: 1,
					},
				}) as MiDriveFile[];

				if (files.length === 0) {
					break;
				}

				cursor = files.at(-1)?.id ?? null;

				for (const file of files) {
					await this.driveService.deleteFileSync(file);
				}
			}

			this.logger.succ('All of files deleted');
		}

		{ // Send email notification
			const profile = await this.userProfilesRepository.findOneByOrFail({ userId: user.id });
			if (profile.email && profile.emailVerified) {
				this.emailService.sendEmail(profile.email, 'Account deleted',
					'Your account has been deleted.',
					'Your account has been deleted.');
			}
		}

		// soft指定されている場合は物理削除しない
		if (job.data.soft) {
		// nop
		} else {
			await this.usersRepository.delete(job.data.user.id);
		}

		return 'Account deleted';
	}
}
