/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In, MoreThan } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { DriveFilesRepository, FollowingsRepository, NotesRepository, PagesRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiNote } from '@/models/Note.js';
import type { MiFollowing } from '@/models/Following.js';
import { EmailService } from '@/core/EmailService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { bindThis } from '@/decorators.js';
import { SearchService } from '@/core/SearchService.js';
import { PageService } from '@/core/PageService.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { DbUserDeleteJobData } from '../types.js';

/**
 * unfollowの同時実行数。unfollowは同一ユーザーのカウンタ行をUPDATEするため、
 * 無制限の並列実行は行ロックの競合を引き起こす
 */
const UNFOLLOW_CONCURRENCY = 8;

/**
 * 上限付きの同時実行で各要素を処理するワーカープール
 */
async function mapWithConcurrency<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
	let cursor = 0;
	const worker = async (): Promise<void> => {
		while (true) {
			const i = cursor++;
			if (i >= items.length) return;
			await fn(items[i]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

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

		@Inject(DI.pagesRepository)
		private pagesRepository: PagesRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private driveService: DriveService,
		private pageService: PageService,
		private emailService: EmailService,
		private queueLoggerService: QueueLoggerService,
		private searchService: SearchService,
		private userFollowingService: UserFollowingService,
		private globalEventService: GlobalEventService,
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

		// 連合Deleteによるリモートユーザーの物理削除でもunfollow処理を行う。
		// 関係行はユーザー行削除時のCASCADEでも消えるが、連合Deleteは削除元サーバー側のsuspendに由来する
		// 場合があり、その場合相手側には関係が残ったままなので、Undo Followの配送で相手側の関係も解消する
		// 必要がある。また、相手がローカルユーザーの場合のカウンタ(followersCount等)の整合はCASCADEでは
		// 取れないため、ここでの処理が必要。
		// なお削除されるアカウントに強制フォローポリシーは適用しない(force指定)。
		{ // Unfollow all
			let cursor: MiFollowing['id'] | null = null;
			const BATCH_SIZE = 50;

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

				cursor = relations.at(-1)?.id ?? null;

				const followeeIds = relations.map(f => f.followeeId);
				if (followeeIds.length === 0) continue;
				const followees = await this.usersRepository.find({
					where: { id: In(followeeIds) },
					// unfollowに必要な列のみ取得する (プロフィール画像などの大きい列を避ける)
					select: { id: true, username: true, host: true, uri: true, inbox: true, sharedInbox: true, isDeleted: true, isSuspended: true },
				});
				const followeesMap = new Map(followees.map(u => [u.id, u]));

				const unfollowErrors: unknown[] = [];
				await mapWithConcurrency(relations, UNFOLLOW_CONCURRENCY, async f => {
					const followee = followeesMap.get(f.followeeId);
					if (!followee) return;
					// force: 削除されるアカウントに強制フォローポリシーは適用しない (関係行はユーザー行削除時にCASCADEで消えるため)
					await this.userFollowingService.unfollow(user, followee, true, true).catch(error => {
						this.logger.warn(`Failed to unfollow ${f.followeeId}: ${error}`);
						unfollowErrors.push(error);
					});
				});
				if (unfollowErrors.length > 0) {
					throw new Error(`Failed to unfollow ${unfollowErrors.length} relation(s); failing the job so it will be retried.`);
				}
			}
			this.logger.succ('All of following deleted');
		}

		{ // Unfollowed by all
			let cursor: MiFollowing['id'] | null = null;
			const BATCH_SIZE = 50;

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

				cursor = relations.at(-1)?.id ?? null;

				const followerIds = relations.map(f => f.followerId);
				if (followerIds.length === 0) continue;
				const followers = await this.usersRepository.find({
					where: { id: In(followerIds) },
					select: { id: true, username: true, host: true, uri: true, inbox: true, sharedInbox: true, isDeleted: true, isSuspended: true },
				});
				const followersMap = new Map(followers.map(u => [u.id, u]));

				const unfollowErrors: unknown[] = [];
				await mapWithConcurrency(relations, UNFOLLOW_CONCURRENCY, async f => {
					const follower = followersMap.get(f.followerId);
					if (!follower) return;
					await this.userFollowingService.unfollow(follower, user, true, true).catch(error => {
						this.logger.warn(`Failed to remove follower ${f.followerId}: ${error}`);
						unfollowErrors.push(error);
					});
				});
				if (unfollowErrors.length > 0) {
					throw new Error(`Failed to remove ${unfollowErrors.length} follower(s); failing the job so it will be retried.`);
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

				// unindexを行削除より先に行う (削除後に失敗するとリトライ時にnoteが見つからず
				// インデックスに残骸が残るため。unindexは冪等なので先行実行で安全)
				for (const note of notes) {
					await this.searchService.unindexNote(note);
				}

				await this.notesRepository.delete(notes.map(note => note.id));
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

		{
			// delete pages. Necessary for decrementing pageCount of notes.
			while (true) {
				const pages = await this.pagesRepository.find({
					where: {
						userId: user.id,
					},
					take: 100,
					order: {
						id: 1,
					},
				});

				if (pages.length === 0) {
					break;
				}
				for (const page of pages) {
					await this.pageService.delete(user, page.id);
				}
			}
		}

		// soft指定されている場合は物理削除しない
		if (job.data.soft) {
		// nop
		} else {
			await this.usersRepository.delete(job.data.user.id);

			// 行の物理削除後に、キャッシュ無効化のためのイベントを発行する。
			// これがないと、削除処理中にdeleteActor受信時のremoteUserUpdated等で各プロセスの
			// uriPersonCacheへ削除済み(isDeleted=true)のユーザーがキャッシュされたまま残り、
			// 後続アクティビティの再解決(resolvePerson)がその古い行を返してしまい、
			// re-createが行われず「failed to resolve user」としてアクティビティが破棄される
			// (キャッシュのTTLが切れるまで最大5分間、連合が破綻する)。
			// 購読側(CacheService)は行が見つからない場合に該当ユーザーのキャッシュエントリを削除する。
			// 発行を物理削除「後」に行うことで、ジョブの完了速度に依存せず確実にキャッシュが無効化される。
			this.globalEventService.publishInternalEvent('userChangeDeletedState', { id: user.id, isDeleted: true });
		}

		{ // Send email notification
		// 全ての破壊処理の後に送る (リトライ時の重複送信を防ぐため。この後に失敗し得る処理はない)
			const profile = await this.userProfilesRepository.findOneByOrFail({ userId: user.id });
			if (profile.email && profile.emailVerified) {
				this.emailService.sendEmail(profile.email, 'Account deleted',
					'Your account has been deleted.',
					'Your account has been deleted.');
			}
		}

		return 'Account deleted';
	}
}
