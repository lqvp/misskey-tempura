/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { NotesRepository } from '@/models/_.js';
import { GetterService } from '@/server/api/GetterService.js';
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
        private getterService: GetterService,
	) {
		super(meta, paramDef, async (ps) => {
			try {
				await this.getterService.getRemoteUser(ps.userId);
			} catch {
				throw new ApiError(meta.errors.notRemoteUser);
			}

			console.log('Dropping all notes of user', ps.userId);

			await this.notesRepository.createQueryBuilder('note')
				.delete()
				.where('userId = :userId', { userId: ps.userId })
				.execute();
		});
	}
}
