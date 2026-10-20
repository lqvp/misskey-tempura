/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UsersRepository } from '@/models/_.js';
import { nameSchema } from '@/models/User.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { AccountUpdateService } from '@/core/AccountUpdateService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:user-name',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '2466528e-ea93-495c-8c29-de2bf52034f5',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		// i/update と同じ上限。省略すると名前を消す
		name: { ...nameSchema, nullable: true },
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
		private globalEventService: GlobalEventService,
		private accountUpdateService: AccountUpdateService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await this.usersRepository.findOneBy({ id: ps.userId });

			if (user == null) {
				throw new ApiError(meta.errors.noSuchUser);
			}

			const name = ps.name ?? null;
			await this.usersRepository.update(user.id, { name });

			// キャッシュを更新し、ローカルユーザーならフォロワーのサーバーにも Update を配送する
			if (user.host == null) {
				this.globalEventService.publishInternalEvent('localUserUpdated', { id: user.id });
				this.accountUpdateService.publishToFollowers(user.id);
			} else {
				this.globalEventService.publishInternalEvent('remoteUserUpdated', { id: user.id });
			}

			this.moderationLogService.log(me, 'updateUserName', {
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
				before: user.name,
				after: name,
			});
		});
	}
}
