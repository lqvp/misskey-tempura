/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Redis from 'ioredis';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { DI } from '@/di-symbols.js';
import { EmailService } from '@/core/EmailService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import { acquireDistributedLock } from '@/misc/distributed-lock.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:approve-account',
	secure: true,
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
	private logger: Logger;

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private moderationLogService: ModerationLogService,
		private emailService: EmailService,
		private loggerService: LoggerService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// decline-user との競合(TOCTOU)を防ぐため、ユーザー単位の分散ロックで直列化する
			const unlock = await acquireDistributedLock(this.redisClient, `account-approval:${ps.userId}`, 30 * 1000, 100, 100);
			try {
				const user = await this.usersRepository.findOneBy({ id: ps.userId });

				if (user == null || user.isDeleted) {
					throw new Error('user not found');
				}

				// approved: false を条件に付けて原子的に更新し、
				// 並行する decline で削除済みのユーザーを承認済みにしない
				const result = await this.usersRepository.update({ id: user.id, approved: false, isDeleted: false }, {
					approved: true,
				});
				if (result.affected === 0) {
					throw new Error('user is already approved or deleted');
				}

				const profile = await this.userProfilesRepository.findOneBy({ userId: ps.userId });

				if (profile?.email) {
					// 承認自体はメール送信に依存させない(失敗時はログに残す)
					try {
						await this.emailService.sendEmail(profile.email, 'Account Approved',
							'Your Account has been approved!<br>Have fun socializing!',
							'Your Account has been approved! Have fun socializing!');
					} catch (err) {
						this.logger.warn(`Failed to send approval email for ${user.id}`, { error: err });
					}
				}

				this.moderationLogService.log(me, 'approve', {
					userId: user.id,
					userUsername: user.username,
				});
			} finally {
				await unlock();
			}
		});
		this.logger = this.loggerService.getLogger('admin-approve-user');
	}
}
