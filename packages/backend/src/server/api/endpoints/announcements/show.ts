/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets, EntityNotFoundError } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AnnouncementService } from '@/core/AnnouncementService.js';
import { RoleService } from '@/core/RoleService.js';
import { DI } from '@/di-symbols.js';
import type { AnnouncementsRepository, AnnouncementRolesRepository } from '@/models/_.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['meta'],

	requireCredential: false,

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'Announcement',
	},

	errors: {
		noSuchAnnouncement: {
			message: 'No such announcement.',
			code: 'NO_SUCH_ANNOUNCEMENT',
			id: 'b57b5e1d-4f49-404a-9edb-46b00268f121',
		},
		noPermission: {
			message: 'No permission to view this announcement.',
			code: 'NO_PERMISSION',
			id: 'fe8d7103-0ea8-4d3c-b0e0-6d5df32e76ec',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		announcementId: { type: 'string', format: 'misskey:id' },
	},
	required: ['announcementId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
        @Inject(DI.announcementsRepository)
        private announcementsRepository: AnnouncementsRepository,

        @Inject(DI.announcementRolesRepository)
        private announcementRolesRepository: AnnouncementRolesRepository,

        private announcementService: AnnouncementService,
        private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const announcement = await this.announcementsRepository.findOneBy({ id: ps.announcementId });
			if (announcement == null) {
				throw new ApiError(meta.errors.noSuchAnnouncement);
			}

			// ロールチェック
			if (announcement.isRoleSpecified) {
				if (!me) {
					throw new ApiError(meta.errors.noPermission);
				}

				const userRoles = await this.roleService.getUserRoles(me.id);
				const announcementRoles = await this.announcementRolesRepository.findBy({
					announcementId: announcement.id,
				});

				// ユーザーが必要なロールを持っているかチェック
				const hasRequiredRole = announcementRoles.some(ar =>
					userRoles.some(ur => ur.id === ar.roleId),
				);

				if (!hasRequiredRole) {
					throw new ApiError(meta.errors.noPermission);
				}
			}

			// 作成者チェック
			if (announcement.userId && announcement.userId !== me?.id) {
				throw new ApiError(meta.errors.noPermission);
			}

			try {
				return await this.announcementService.getAnnouncement(ps.announcementId, me);
			} catch (err) {
				if (err instanceof EntityNotFoundError) throw new ApiError(meta.errors.noSuchAnnouncement);
				throw err;
			}
		});
	}
}
