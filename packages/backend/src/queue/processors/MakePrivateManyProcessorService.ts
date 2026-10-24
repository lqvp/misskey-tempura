/*
 * SPDX-FileCopyrightText: lqvp and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { UsersRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { DbUserMakePrivateManyJobData } from '../types.js';

@Injectable()
export class MakePrivateManyProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private noteDeleteService: NoteDeleteService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('make-private-many');
	}

	@bindThis
	public async process(job: Bull.Job<DbUserMakePrivateManyJobData>): Promise<string | void> {
		const user = await this.usersRepository.findOneBy({ id: job.data.user.id });
		if (user == null) {
			return;
		}

		this.logger.info(`Making notes private for user ${user.id} (since=${job.data.sinceDate}, until=${job.data.untilDate})...`);

		const count = await this.noteDeleteService.makePrivateMany(user, job.data.sinceDate, job.data.untilDate);

		this.logger.succ(`Made ${count} notes private for user ${user.id}.`);
	}
}
