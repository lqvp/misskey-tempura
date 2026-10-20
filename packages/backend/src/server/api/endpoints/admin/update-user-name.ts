/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:user-name',

	errors: {
		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: 'f817d1db-b4fe-493f-bf1c-2e6b177fa7ca',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string' },
	},
	required: ['userId'],
} as const;

// eslint-disable-next-line import/no-default-export
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private moderationLogService: ModerationLogService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await this.usersRepository.findOneBy({ id: ps.userId });

			if (user == null) {
				throw new Error('user not found');
			}

			// 管理者以外は、自分以外のモデレーター・管理者の名前を変えられないようにする (admin/suspend-user と同じ考え方)
			if (me.id !== user.id && await this.roleService.isModerator(user) && !await this.roleService.isAdministrator(me)) {
				throw new ApiError(meta.errors.accessDenied);
			}

			await this.usersRepository.update(user.id, {
				name: ps.name ?? null,
			});

			this.moderationLogService.log(me, 'updateUserName', {
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
				before: user.name,
				after: ps.name ?? null,
			});
		});
	}
}
