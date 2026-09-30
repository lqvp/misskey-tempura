/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Config } from '@/config.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AvatarDecorationService } from '@/core/AvatarDecorationService.js';
import { DriveService } from '@/core/DriveService.js';
import { IdService } from '@/core/IdService.js';
import { validateRemoteUrl } from '@/misc/validate-remote-url.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requiredRolePolicy: 'canManageAvatarDecorations',
	kind: 'write:admin:avatar-decorations',

	errors: {
		invalidRemoteUrl: {
			message: 'The decoration url points at a non-public host or invalid target.',
			code: 'INVALID_REMOTE_URL',
			id: '8f3a1e2c-7b4d-4a5f-9c6e-1d2b3c4d5e6f',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			id: {
				type: 'string',
				optional: false, nullable: false,
				format: 'id',
			},
			createdAt: {
				type: 'string',
				optional: false, nullable: false,
				format: 'date-time',
			},
			updatedAt: {
				type: 'string',
				optional: false, nullable: true,
				format: 'date-time',
			},
			name: {
				type: 'string',
				optional: false, nullable: false,
			},
			description: {
				type: 'string',
				optional: false, nullable: false,
			},
			url: {
				type: 'string',
				optional: false, nullable: false,
			},
			roleIdsThatCanBeUsedThisDecoration: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'string',
					optional: false, nullable: false,
					format: 'id',
				},
			},
			category: {
				type: 'string',
				optional: false, nullable: true,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 1 },
		description: { type: 'string' },
		url: { type: 'string', minLength: 1 },
		roleIdsThatCanBeUsedThisDecoration: { type: 'array', items: {
			type: 'string',
		} },
		category: { type: 'string', nullable: true },
	},
	required: ['name', 'description', 'url'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.config)
		private config: Config,
		private avatarDecorationService: AvatarDecorationService,
		private driveService: DriveService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// SSRFガード: canManageAvatarDecorations ポリシー保持者なら管理者でなくても
			// 到達できるため、サーバーによる外部URL取得の前にプライベート/ループバック宛を拒否する
			if (!validateRemoteUrl(ps.url, this.config)) {
				throw new ApiError(meta.errors.invalidRemoteUrl);
			}

			// システムユーザーとして再アップロード
			const sysFileData = await this.driveService.uploadFromUrl({
				url: ps.url,
				user: null,
				force: true,
			});

			// Keep the source file: matching DriveFile URLs do not prove that notes or users no longer reference it.

			const created = await this.avatarDecorationService.create({
				name: ps.name,
				description: ps.description,
				url: sysFileData.url,
				roleIdsThatCanBeUsedThisDecoration: ps.roleIdsThatCanBeUsedThisDecoration,
				category: ps.category,
			}, me);

			return {
				id: created.id,
				createdAt: this.idService.parse(created.id).date.toISOString(),
				updatedAt: null,
				name: created.name,
				description: created.description,
				url: created.url,
				roleIdsThatCanBeUsedThisDecoration: created.roleIdsThatCanBeUsedThisDecoration,
				category: created.category,
			};
		});
	}
}
