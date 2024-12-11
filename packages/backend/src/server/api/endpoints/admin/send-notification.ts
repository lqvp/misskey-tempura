/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { NotificationService } from '@/core/NotificationService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:send-notification',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		text: { type: 'string' },
	},
	required: ['userId', 'text'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
        @Inject(DI.usersRepository)
        private usersRepository: UsersRepository,

        private notificationService: NotificationService,
        private moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await this.usersRepository.findOneBy({ id: ps.userId });

			if (user == null) {
				throw new Error('user not found');
			}

			await this.notificationService.createNotification(user.id, 'app', {
				appAccessTokenId: null,
				customBody: ps.text,
				customHeader: '[モデレーション] 通知',
				customIcon: null,
			});

			this.moderationLogService.log(me, 'sendNotification', {
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
				text: ps.text,
			});
		});
	}
}
