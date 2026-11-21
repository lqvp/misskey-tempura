/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:show-user',

	// For moderators: the main/sub relation is returned regardless of the users' own show/hide settings.
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				userId: { type: 'string', format: 'id', optional: false, nullable: false },
				subAccountRole: { type: 'string', enum: ['main', 'sub'], optional: false, nullable: true },
				mainAccount: { type: 'object', optional: false, nullable: true, ref: 'UserLite' },
				subAccountCount: { type: 'integer', optional: false, nullable: false },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userIds: { type: 'array', items: { type: 'string', format: 'misskey:id' }, minItems: 1, maxItems: 100 },
	},
	required: ['userIds'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const users = await this.usersRepository.findBy({ id: In(ps.userIds) });
			const local = users.filter(u => u.host == null);

			const parentIds = [...new Set(local.map(u => u.parentUserId).filter((x): x is string => x != null))];
			const parents = parentIds.length > 0 ? await this.usersRepository.findBy({ id: In(parentIds), isDeleted: false }) : [];
			const packedParents = new Map((await this.userEntityService.packMany(parents, me, { schema: 'UserLite' })).map(p => [p.id, p]));

			const counts = local.length > 0
				? await this.usersRepository.createQueryBuilder('sub')
					.select('sub.parentUserId', 'parentUserId')
					.addSelect('COUNT(*)', 'count')
					.where('sub.parentUserId IN (:...ids)', { ids: local.map(u => u.id) })
					.andWhere('sub.isDeleted = FALSE')
					.groupBy('sub.parentUserId')
					.getRawMany<{ parentUserId: string; count: string }>()
				: [];
			const countMap = new Map(counts.map(c => [c.parentUserId, Number(c.count)]));

			return users.map(u => {
				const subAccountCount = u.host == null ? (countMap.get(u.id) ?? 0) : 0;
				return {
					userId: u.id,
					subAccountRole: u.host != null ? null : u.parentUserId != null ? 'sub' as const : subAccountCount > 0 ? 'main' as const : null,
					mainAccount: u.host == null && u.parentUserId != null ? (packedParents.get(u.parentUserId) ?? null) : null,
					subAccountCount,
				};
			});
		});
	}
}
