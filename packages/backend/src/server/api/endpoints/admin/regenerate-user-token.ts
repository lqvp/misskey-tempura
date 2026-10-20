/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsersRepository } from '@/models/_.js';
import { generateNativeUserToken } from '@/misc/token.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DI } from '@/di-symbols.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:regenerate-user-token',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '0e016c85-8dff-4b26-b515-72f5b3458e47',
		},
		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: 'fde42a50-8370-4f76-a06b-431f49b0e892',
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

// eslint-disable-next-line import/no-default-export
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private globalEventService: GlobalEventService,
		private moderationLogService: ModerationLogService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await this.usersRepository.findOneBy({ id: ps.userId });

			if (user == null) {
				throw new ApiError(meta.errors.noSuchUser);
			}

			// モデレーターが管理者を強制的にログアウトさせられないようにする (admin/reset-password と同じ)
			if (await this.roleService.isAdministrator(user) && me.id !== user.id) {
				throw new ApiError(meta.errors.accessDenied);
			}

			const oldToken = user.token;
			if (oldToken == null) return;

			const newToken = generateNativeUserToken();
			await this.usersRepository.update(user.id, {
				token: newToken,
			});

			// Publish event
			this.globalEventService.publishInternalEvent('userTokenRegenerated', { id: user.id, oldToken, newToken });
			this.globalEventService.publishMainStream(user.id, 'myTokenRegenerated');

			this.moderationLogService.log(me, 'regenerateUserToken', {
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
			});
		});
	}
}
