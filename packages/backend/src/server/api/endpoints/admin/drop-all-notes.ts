/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import type { NotesRepository } from '@/models/_.js';
import { GetterService } from '@/server/api/GetterService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	secure: true,
	kind: 'write:admin:drop-all-notes',

	errors: {
		notRemoteUser: {
			message: 'This operation cannot be performed because the target user is not a remote user.',
			code: 'NOT_REMOTE_USER',
			id: '1595559f-efd2-4e52-81c9-5ef9bcd28ce3',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private getterService: GetterService,
		private moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				await this.getterService.getRemoteUser(ps.userId);
			} catch {
				throw new ApiError(meta.errors.notRemoteUser);
			}

			console.log('Dropping all notes of user', ps.userId);

			const user = await this.usersRepository.findOneByOrFail({ id: ps.userId });
			this.moderationLogService.log(me, 'dropAllNotes', {
				userId: ps.userId,
				userUsername: user.username,
				userHost: user.host,
			});

			await this.notesRepository.createQueryBuilder('note')
				.delete()
				.where('userId = :userId', { userId: ps.userId })
				.execute();
		});
	}
}
