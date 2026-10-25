/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UserSsoLinkRepository, MiMeta } from '@/models/_.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:show-user',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			links: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						provider: { type: 'string', optional: false, nullable: false },
						label: { type: 'string', optional: false, nullable: false },
						createdAt: { type: 'string', optional: false, nullable: false, format: 'date-time' },
					},
				},
			},
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

/** 管理画面で、強制解除の対象を選ぶために、ユーザーの SSO 連携の一覧 (連携した外部アカウントの識別子は含まない) を返す */
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.userSsoLinkRepository)
		private userSsoLinkRepository: UserSsoLinkRepository,
	) {
		super(meta, paramDef, async (ps) => {
			const links = await this.userSsoLinkRepository.findBy({ userId: ps.userId });
			return {
				links: links.map(l => ({
					provider: l.provider,
					label: this.serverSettings.ssoProviders.find(p => p.key === l.provider)?.buttonLabel?.trim() || l.provider,
					createdAt: l.createdAt.toISOString(),
				})),
			};
		});
	}
}
