/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import type { UsersRepository, UserSsoLinkRepository, UserProfilesRepository, MiMeta } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { EmailService } from '@/core/EmailService.js';
import { notifySsoLinksRemoved } from '@/misc/sso-unlink-notify.js';
import { ApiLoggerService } from '../../ApiLoggerService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:sso-unlink-user',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'ccafc7fe-5074-4edd-9dc0-8ef9ef6a701d',
		},
		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: 'cda8f8ce-89a6-4f92-8055-33bbe0c1464d',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			unlinked: {
				type: 'number',
				optional: false, nullable: false,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		// 解除する連携のプロバイダー key (複数選べる)。ユーザーが連携していないものは無視する
		providers: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 128 }, minItems: 1, maxItems: 100, uniqueItems: true },
	},
	required: ['userId', 'providers'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userSsoLinkRepository)
		private userSsoLinkRepository: UserSsoLinkRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private roleService: RoleService,
		private moderationLogService: ModerationLogService,
		private notificationService: NotificationService,
		private emailService: EmailService,
		private apiLoggerService: ApiLoggerService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await this.usersRepository.findOneBy({ id: ps.userId });
			if (user == null) {
				throw new ApiError(meta.errors.noSuchUser);
			}

			// 管理者のアカウントは (本人以外) 操作できない。パスワードのリセット・二要素認証の解除と同じ
			if (await this.roleService.isAdministrator(user) && me.id !== user.id) {
				throw new ApiError(meta.errors.accessDenied);
			}

			// 選ばれたプロバイダーの連携だけを、読んだ内容と同じ id 指定で削除する。選ばれていない連携や、読んだあとに作られた連携は消さず、通知もしない
			const links = await this.userSsoLinkRepository.findBy({ userId: user.id, provider: In(ps.providers) });
			if (links.length === 0) {
				return { unlinked: 0 };
			}
			await this.userSsoLinkRepository.delete(links.map(l => l.id));

			const providerKeys = [...new Set(links.map(l => l.provider))];
			this.moderationLogService.log(me, 'unlinkUserSso', {
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
				providers: providerKeys,
			});

			// 解除された本人にだけ、解除したあとで通知する。通知の失敗で解除の成功を覆さない
			const deps = {
				notificationService: this.notificationService,
				emailService: this.emailService,
				userProfilesRepository: this.userProfilesRepository,
				onError: (userId: string, err: unknown) => this.apiLoggerService.logger.warn(`failed to notify SSO link removal to ${userId}: ${err}`),
			};
			for (const key of providerKeys) {
				const label = this.serverSettings.ssoProviders.find(p => p.key === key)?.buttonLabel?.trim() || key;
				notifySsoLinksRemoved(deps, [user.id], label, 'admin').catch(err => this.apiLoggerService.logger.warn(`failed to notify SSO link removal: ${err}`));
			}

			return { unlinked: links.length };
		});
	}
}
