/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { NotesRepository, UsersRepository } from '@/models/_.js';
import type { DriveFilesRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';
import { DriveService } from '@/core/DriveService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { ScheduledNoteDeleteJobData } from '../types.js';

@Injectable()
export class ScheduledNoteDeleteProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.driveFilesRepository)
		private drivesRepository: DriveFilesRepository,

		private noteDeleteService: NoteDeleteService,
		private driveService: DriveService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('scheduled-note-delete');
	}

	@bindThis
	public async process(job: Bull.Job<ScheduledNoteDeleteJobData>): Promise<void> {
		const note = await this.notesRepository.findOneBy({ id: job.data.noteId });
		if (note == null) {
			return;
		}

		const user = await this.usersRepository.findOneBy({ id: note.userId });
		if (user == null) {
			return;
		}

		if (job.data.isScheduledForPrivate) {
			await this.noteDeleteService.makePrivate(user, note);
			this.logger.info(`Made note ${note.id} private`);
		} else {
			await this.noteDeleteService.delete(user, note);
			this.logger.info(`Deleted note ${note.id}`);

			// 添付ファイルがあれば削除
			if (job.data.fileIds && job.data.fileIds.length > 0) {
				const files = await this.drivesRepository.findBy({
					id: In(job.data.fileIds),
					userId: user.id,
				});

				let deletedCount = 0;
				for (const file of files) {
					// 他のノートから参照されているファイル(投稿後に別ノートへ再添付されたものなど)は
					// 削除するとそのノートから失われるためスキップする
					// @> 述語は GIN インデックス (array_ops) で利用できる形式にする
					const referencedCount = await this.notesRepository.createQueryBuilder('note')
						.where('note.fileIds @> ARRAY[:fileId]::character varying[]', { fileId: file.id })
						.getCount();
					if (referencedCount > 0) {
						this.logger.info(`Skipped deleting file ${file.id}: referenced by ${referencedCount} other note(s)`);
						continue;
					}
					await this.driveService.deleteFileImmediately(file, false, user);
					deletedCount++;
				}

				this.logger.info(`Deleted ${deletedCount} attached files: ${files.map(f => f.id).join(', ')}`);
			}
		}
	}
}
