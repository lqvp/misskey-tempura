/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsersRepository } from '@/models/_.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { RoleService } from '@/core/RoleService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:clear-suspicious-login-flag',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '8eaad46c-95dc-4ff2-93e2-4df4e56b93fa',
		},

		cannotClearOwnFlag: {
			message: 'You cannot clear your own suspicious login flag.',
			code: 'CANNOT_CLEAR_OWN_FLAG',
			id: 'f3b2101c-a8dc-4d80-af1a-28ee7b1a0b57',
		},

		cannotClearAdministratorFlag: {
			message: 'Only administrators can clear the flag of an administrator.',
			code: 'CANNOT_CLEAR_ADMINISTRATOR_FLAG',
			id: '2071143e-c7f2-4798-8890-a585b203473a',
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

			// 乗っ取られたモデレーターが、検知された直後に自分で解除できないようにする
			if (user.id === me.id) {
				throw new ApiError(meta.errors.cannotClearOwnFlag);
			}

			if (await this.roleService.isAdministrator(user) && !await this.roleService.isAdministrator(me)) {
				throw new ApiError(meta.errors.cannotClearAdministratorFlag);
			}

			await this.usersRepository.update(user.id, {
				suspiciousLoginDetectedAt: null,
			});

			this.globalEventService.publishInternalEvent('localUserUpdated', { id: user.id });

			await this.moderationLogService.log(me, 'clearSuspiciousLoginFlag', {
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
			});
		});
	}
}
