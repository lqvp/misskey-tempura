/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';
import { QueueService } from '@/core/QueueService.js';
import { DI } from '@/di-symbols.js';
import { GetterService } from '@/server/api/GetterService.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,
	requiredRolePolicy: 'canUseMakePrivate',

	kind: 'write:notes',

	limit: {
		duration: ms('1hour'),
		max: 1,
		minInterval: ms('1hour'),
	},

	errors: {
		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: 'fe8d7103-0ea8-4ec3-814d-f8b401dc69e9',
		},
		tooManyNotes: {
			message: 'you can\'t make private > 500 notes',
			code: 'TOO_MANY_NOTES',
			id: 'c61acfd1-6efa-409e-a6d7-3424a3c8c150',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		untilDate: { type: 'integer' },
		sinceDate: { type: 'integer' },
	},
	required: ['untilDate', 'sinceDate'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		// private getterService: GetterService,
		// private roleService: RoleService,
		private noteDeleteService: NoteDeleteService,
		private queueService: QueueService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const sinceDate = ps.sinceDate || 0;
			const untilDate = ps.untilDate || Date.now();
			if (sinceDate > untilDate) { return 0; }
			const count = await this.noteDeleteService.makePrivateMany(me, sinceDate, untilDate, true);
			if (count > 500) {
				throw new ApiError(meta.errors.tooManyNotes);
			}
			if (count > 0) {
				// 実際の非公開化はキュージョブで非同期に行う。
				// リクエスト内で処理するとチャンク間の待機(1分/10件)で最大約50分
				// レスポンスが返らないため。
				await this.queueService.createMakePrivateManyJob(me, sinceDate, untilDate);
			}
			return count;
		});
	}
}
