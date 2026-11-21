/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from "@nestjs/common";
import * as Redis from 'ioredis';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsedUsernamesRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { DI } from '@/di-symbols.js';
import { EmailService } from '@/core/EmailService.js';
import { DeleteAccountService } from '@/core/DeleteAccountService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import { acquireDistributedLock } from '@/misc/distributed-lock.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:decline-account',
	secure: true,

	// declining deletes the (unapproved) account, so a sub-account must not do it to its main/sibling accounts
	protectFamily: [{ param: 'userId' }],
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		reason: { type: 'string', nullable: true },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	private logger: Logger;
	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.usedUsernamesRepository)
		private usedUsernamesRepository: UsedUsernamesRepository,

		private moderationLogService: ModerationLogService,
		private emailService: EmailService,
		private deleteAccountService: DeleteAccountService,
		private loggerService: LoggerService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// approve-user との競合(TOCTOU)を防ぐため、ユーザー単位の分散ロックで直列化する
			const unlock = await acquireDistributedLock(this.redisClient, `account-approval:${ps.userId}`, 30 * 1000, 100, 100);
			let email: string | null = null;
			let reason: string | undefined;
			let userId: string | null = null;
			try {
			const user = await this.usersRepository.findOneBy({ id: ps.userId });

			if (user == null || user.isDeleted) {
				throw new Error('user not found or already deleted');
			}

			if (user.approved) {
				throw new Error('user is already approved');
			}

			if (user.host) {
				throw new Error('user is not local');
			}

			const profile = await this.userProfilesRepository.findOneBy({ userId: ps.userId });

			reason = ps.reason?.trim();
			userId = user.id;
			// メール送信はロック保持時間を短くするためロックの外で行う
			// (メール送信の待ち時間が長引くと 30 秒のロック期限を超え、
			//  approve-user との直列化が崩れるため)
			email = profile?.email ?? null;

			const log_reason = reason ? reason : 'Reason not provided';

			await this.usedUsernamesRepository.delete({ username: user.username });
			await this.deleteAccountService.deleteAccount(user);

			this.moderationLogService.log(me, 'decline', {
				userId: user.id,
				userUsername: user.username,
				// userHost: user.host,
				reason: log_reason,
			});
			} finally {
				await unlock();
			}

			// 削除自体はメール送信に依存させない(失敗時はログに残す)
			if (email) {
				try {
					if (!reason) {
						await this.emailService.sendEmail(email, 'Account declined',
							'Your Account has been declined!',
							'Your Account has been declined!');
					} else {
						await this.emailService.sendEmail(email, 'Account declined',
							`Your account has been declined due to: ${reason}`,
							`Your account has been declined due to: ${reason}`);
					}
				} catch (err) {
					this.logger.warn(`Failed to send decline email for ${userId}`, { error: err });
				}
			}
		});
		this.logger = this.loggerService.getLogger('admin-decline-user');
	}
}
