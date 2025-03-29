/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets, And, In, MoreThan, Not } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { DriveFilesRepository, NotesRepository, UserNotePiningsRepository, UsersRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { bindThis } from '@/decorators.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { DbUserTruncateJobData } from '../types.js';

@Injectable()
export class TruncateAccountProcessorService {
	private logger: Logger;

	private static readonly BATCH_SIZE = 5;
	private static readonly DELETION_PAUSE_MS = 30000;
	private static readonly FILE_BATCH_SIZE = 10;

	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.userNotePiningsRepository)
		private userNotePiningsRepository: UserNotePiningsRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private driveService: DriveService,
		private queueLoggerService: QueueLoggerService,
		private noteDeleteService: NoteDeleteService,
		private notificationService: NotificationService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('truncate-account');
	}

	@bindThis
	private async findCascadingNotes(noteIds: string[]): Promise<string[]> {
		if (noteIds.length === 0) return [];

		const findRelatedNotes = async (targetNoteIds: string[]): Promise<string[]> => {
			const query = this.notesRepository.createQueryBuilder('note')
				.where(new Brackets(qb => {
					qb.where('note.replyId IN(:...targetNoteIds)', { targetNoteIds })
						.orWhere(new Brackets(q => {
							q.where('note.renoteId IN(:...targetNoteIds)', { targetNoteIds })
								.andWhere('note.text IS NOT NULL');
						}));
				}));

			const relatedNotes = await query.getMany();
			if (relatedNotes.length === 0) return [];

			const relatedNoteIds = relatedNotes.map(note => note.id);
			const cascadingIds = await findRelatedNotes(relatedNoteIds);

			return [...relatedNoteIds, ...cascadingIds];
		};

		return findRelatedNotes(noteIds);
	}

	private async getNotesToKeep(userId: string): Promise<{
		noteIds: string[];
		keepFileIds: string[];
		deleteTargetFileIds: string[];
	}> {
		// ピン留めされたノートの取得
		const pinings = await this.userNotePiningsRepository.findBy({ userId });
		const piningNoteIds = pinings.map(pining => pining.noteId);
		const cascadingPiningNoteIds = await this.findCascadingNotes(piningNoteIds);

		// 非公開ノートの取得
		const specifiedNotes = await this.notesRepository.findBy({
			userId,
			visibility: Not(In(['public', 'home', 'followers'])),
		});
		const specifiedNoteIds = specifiedNotes.map(note => note.id);
		const cascadingSpecifiedNoteIds = await this.findCascadingNotes(specifiedNoteIds);

		// 保持すべきノートIDの結合
		const notesToKeep = [
			...piningNoteIds,
			...cascadingPiningNoteIds,
			...specifiedNoteIds,
			...cascadingSpecifiedNoteIds,
		];

		// 削除対象のノートを取得（公開範囲が public, home, followers のノート）
		const deletionTargetNotes = await this.notesRepository.find({
			where: {
				userId,
				visibility: In(['public', 'home', 'followers']),
				id: Not(In(notesToKeep)),
			},
			select: ['id', 'fileIds'], // 必要なフィールドのみ取得
		});

		// 保持するノートのファイルIDを収集
		const keepFileIds = await this.collectFileIdsFromNotes(notesToKeep);

		// 削除対象のノートからファイルIDを収集
		const deleteTargetFileIds = deletionTargetNotes
			.flatMap(note => note.fileIds ?? [])
			.filter(fileId => !keepFileIds.includes(fileId)); // 保持するファイルは除外

		// ここで、保持すべきファイルIDを確認し、削除対象から除外する
		const filesToDelete = deleteTargetFileIds.filter(fileId => !keepFileIds.includes(fileId));

		return {
			noteIds: notesToKeep,
			keepFileIds,
			deleteTargetFileIds: filesToDelete,
		};
	}

	private async collectFileIdsFromNotes(noteIds: string[]): Promise<string[]> {
		if (noteIds.length === 0) return [];

		const notes = await this.notesRepository.findBy({ id: In(noteIds) });
		return notes.flatMap(note => note.fileIds ?? []);
	}

	private async deleteNotesBatch(
		user: MiUser,
		excludeNoteIds: string[],
		cursor: string | null = null,
	): Promise<{ count: number; nextCursor: string | null }> {
		const notes = await this.notesRepository.find({
			where: {
				userId: user.id,
				...(cursor ? {
					id: And(Not(In(excludeNoteIds)), MoreThan(cursor)),
				} : {
					id: Not(In(excludeNoteIds)),
				}),
			},
			take: TruncateAccountProcessorService.BATCH_SIZE,
			order: { id: 'ASC' },
		});

		if (notes.length === 0) {
			return { count: 0, nextCursor: null };
		}

		await Promise.all(notes.map(note =>
			this.noteDeleteService.delete(user, note, false, user),
		));

		return {
			count: notes.length,
			nextCursor: notes.at(-1)?.id ?? null,
		};
	}

	private async deleteFiles(userId: string, deleteTargetFileIds: string[]): Promise<number> {
		if (deleteTargetFileIds.length === 0) return 0;

		let cursor: string | null = null;
		let deletedCount = 0;

		while (true) {
			const files = await this.driveFilesRepository.find({
				where: {
					id: In(deleteTargetFileIds),
					userId,
					...(cursor ? { id: MoreThan(cursor) } : {}),
				},
				take: TruncateAccountProcessorService.FILE_BATCH_SIZE,
				order: { id: 'ASC' },
			});

			if (files.length === 0) break;

			cursor = files.at(-1)?.id ?? null;
			await Promise.all(files.map(file => this.driveService.deleteFileSync(file)));
			deletedCount += files.length;
		}

		return deletedCount;
	}

	private formatDuration(durationMs: number): string {
		const seconds = Math.floor(durationMs / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		const remainingMinutes = minutes % 60;
		const remainingSeconds = seconds % 60;

		const parts = [];
		if (hours > 0) parts.push(`${hours}時間`);
		if (remainingMinutes > 0) parts.push(`${remainingMinutes}分`);
		if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}秒`);

		return parts.join('');
	}

	@bindThis
	public async process(job: Bull.Job<DbUserTruncateJobData>): Promise<string | void> {
		const startTime = Date.now();
		const userId = job.data.user.id;
		this.logger.info(`Truncating account data for user ${userId}...`);

		const user = await this.usersRepository.findOneBy({ id: userId });
		if (!user) {
			this.logger.warn(`User ${userId} not found`);
			return;
		}

		const { noteIds: notesToKeep, deleteTargetFileIds } = await this.getNotesToKeep(userId);

		// ノートの削除
		let cursor: string | null = null;
		let totalNotesDeleted = 0;

		while (true) {
			const { count, nextCursor } = await this.deleteNotesBatch(user, notesToKeep, cursor);
			if (count === 0) break;

			totalNotesDeleted += count;
			cursor = nextCursor;

			if (totalNotesDeleted % TruncateAccountProcessorService.BATCH_SIZE === 0) {
				this.logger.info(`Deleted ${totalNotesDeleted} notes. Pausing for rate limiting...`);
				await new Promise(resolve => setTimeout(resolve, TruncateAccountProcessorService.DELETION_PAUSE_MS));
			}
		}

		this.logger.info(`Completed deleting ${totalNotesDeleted} notes`);

		// ファイルの削除処理
		const totalFilesDeleted = await this.deleteFiles(user.id, deleteTargetFileIds);
		this.logger.info(`Completed deleting ${totalFilesDeleted} files`);

		const endTime = Date.now();
		const duration = this.formatDuration(endTime - startTime);

		// 詳細な完了通知
		const notificationBody = [
			'アカウントの整理が完了しました。',
			'',
			'処理内容:',
			`・${totalNotesDeleted.toLocaleString()}件のノートを削除`,
			`・${totalFilesDeleted.toLocaleString()}件のファイルを削除`,
			'',
			`処理時間: ${duration}`,
		].join('\n');

		await this.notificationService.createNotification(user.id, 'app', {
			appAccessTokenId: null,
			customBody: notificationBody,
			customHeader: '[システム通知] アカウントの整理完了',
			customIcon: null,
		});

		this.logger.succ(`Successfully truncated account for user ${userId}`);
		return 'Account notes and drives are truncated';
	}
}
