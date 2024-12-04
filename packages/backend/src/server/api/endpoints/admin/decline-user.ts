/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from "@nestjs/common";
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsedUsernamesRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { DI } from '@/di-symbols.js';
import { EmailService } from '@/core/EmailService.js';
import { DeleteAccountService } from '@/core/DeleteAccountService.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:decline-account',
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
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.usedUsernamesRepository)
		private usedUsernamesRepository: UsedUsernamesRepository,

		private moderationLogService: ModerationLogService,
		private emailService: EmailService,
		private deleteAccountService: DeleteAccountService,
	) {
		super(meta, paramDef, async (ps, me) => {
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

			const reason = ps.reason?.trim();

			if (profile?.email) {
				if (!reason) {
					await this.emailService.sendEmail(profile.email, 'Account Declined',
						'Your Account has been declined!',
						'Your Account has been declined!');
				} else {
					await this.emailService.sendEmail(profile.email, 'Account Declined',
						`Your account has been declined due to: ${reason}`,
						`Your account has been declined due to: ${reason}`);
				}
			}

			const log_reason = reason ? reason : 'Reason not provided';

			await this.usedUsernamesRepository.delete({ username: user.username });
			await this.deleteAccountService.deleteAccount(user);

			this.moderationLogService.log(me, 'decline', {
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
				reason: log_reason,
			});
		});
	}
}
