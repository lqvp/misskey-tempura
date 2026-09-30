/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { In, Not } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { Config } from '@/config.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { DriveFilesRepository } from '@/models/_.js';
import { AvatarDecorationService } from '@/core/AvatarDecorationService.js';
import { DriveService } from '@/core/DriveService.js';
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
			id: '7c4b2d1e-6a5f-4b3c-8d7e-9f0a1b2c3d4e',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', minLength: 1 },
		description: { type: 'string' },
		url: { type: 'string', minLength: 1 },
		roleIdsThatCanBeUsedThisDecoration: { type: 'array', items: {
			type: 'string',
		} },
		category: { type: 'string', nullable: true },
	},
	required: ['id'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,
		@Inject(DI.config)
		private config: Config,
		private avatarDecorationService: AvatarDecorationService,
		private driveService: DriveService,
	) {
		super(meta, paramDef, async (ps, me) => {
			let fileUrl = ps.url;
			// URLに変更があるか
			if (typeof ps.url !== 'undefined' || typeof ps.url === 'string' ) {
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
				fileUrl = sysFileData.url;

				// 元ファイルの削除（実ファイルで、他所で参照されていなければ削除する）
				const originalDriveFile = await this.driveFilesRepository.findOneBy({ url: ps.url, id: Not(sysFileData.id) });
				if (originalDriveFile != null) {
					const referenceCount = await this.driveFilesRepository.count({
						where: { url: ps.url, id: Not(In([originalDriveFile.id, sysFileData.id])) },
					});
					if (referenceCount === 0) {
						await this.driveService.deleteFile(originalDriveFile);
					}
				}
			}
			await this.avatarDecorationService.update(ps.id, {
				name: ps.name,
				description: ps.description,
				url: fileUrl,
				roleIdsThatCanBeUsedThisDecoration: ps.roleIdsThatCanBeUsedThisDecoration,
				category: ps.category,
			}, me);
		});
	}
}
