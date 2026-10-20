/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { nameSchema } from '@/models/User.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { RoleService } from '@/core/RoleService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { AccountUpdateService } from '@/core/AccountUpdateService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { collectProfileEmojis } from '@/misc/collect-profile-emojis.js';
import type Logger from '@/logger.js';
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
		// i/update と同じ上限。名前を消すときは null を明示する (省略で消えないように必須にしている)
		name: { ...nameSchema, nullable: true },
	},
	required: ['userId', 'name'],
} as const;

// eslint-disable-next-line import/no-default-export
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	private logger: Logger;

	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private moderationLogService: ModerationLogService,
		private roleService: RoleService,
		private globalEventService: GlobalEventService,
		private accountUpdateService: AccountUpdateService,
		private userEntityService: UserEntityService,
		private loggerService: LoggerService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await this.usersRepository.findOneBy({ id: ps.userId });

			if (user == null) {
				throw new ApiError(meta.errors.noSuchUser);
			}

			// 管理者以外は、自分以外のモデレーター・管理者の名前を変えられないようにする (admin/suspend-user と同じ考え方)
			if (me.id !== user.id && await this.roleService.isModerator(user) && !await this.roleService.isAdministrator(me)) {
				throw new ApiError(meta.errors.accessDenied);
			}

			// i/update と同じく前後の空白を除き、空なら名前を消す
			const trimmed = ps.name?.trim() ?? '';
			const name = trimmed === '' ? null : trimmed;
			if (name === user.name) return;

			if (user.host == null) {
				// 名前に含まれるカスタム絵文字も含めて users.emojis を計算し直す
				const profile = await this.userProfilesRepository.findOneByOrFail({ userId: user.id });
				const emojis = collectProfileEmojis({ name, description: profile.description, fields: profile.fields, followedMessage: profile.followedMessage });
				await this.usersRepository.update(user.id, { name, emojis });

				// キャッシュを更新し、本人の画面とフォロワーのサーバーにも知らせる
				this.globalEventService.publishInternalEvent('localUserUpdated', { id: user.id });
				const updatedUser = await this.usersRepository.findOneByOrFail({ id: user.id });
				this.globalEventService.publishMainStream(user.id, 'meUpdated', await this.userEntityService.pack(updatedUser, updatedUser, {
					schema: 'MeDetailed',
					includeSecrets: true,
				}));
				this.accountUpdateService.publishToFollowers(user.id).catch(err => {
					this.logger.warn(`Failed to deliver the name change of ${user.id}: ${err}`);
				});
			} else {
				// リモートユーザーの絵文字は相手のサーバーのタグから決まるので触らない
				await this.usersRepository.update(user.id, { name });
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
		this.logger = this.loggerService.getLogger('admin-update-user-name');
	}
}
