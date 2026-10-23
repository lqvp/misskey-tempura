/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { RoleService } from '@/core/RoleService.js';
import { DI } from '@/di-symbols.js';
import { UserSearchService } from '@/core/UserSearchService.js';
import type { MiMeta } from '@/models/_.js';
import { type Config } from '@/config.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['users'],

	requireCredential: false,
	requiredRolePolicy: 'canSearchUsers',

	description: 'Search for users.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'User',
		},
	},

	errors: {
		unavailable: {
			message: 'Search of users unavailable.',
			code: 'UNAVAILABLE',
			id: '6906fe43-5c60-489a-8191-171c6a7127b0',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: { type: 'string' },
		offset: { type: 'integer', default: 0 },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		origin: { type: 'string', enum: ['local', 'remote', 'combined'], default: 'combined' },
		detail: { type: 'boolean', default: true },
	},
	required: ['query'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		private userEntityService: UserEntityService,
		private userSearchService: UserSearchService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const policies = await this.roleService.getUserPolicies(me ? me.id : null);
			if (!policies.canSearchUsers) {
				throw new ApiError(meta.errors.unavailable);
			}

			// 訪問者への公開範囲が 'none' の間は匿名のユーザー検索を返さない
			if (me == null && this.serverSettings.ugcVisibilityForVisitor === 'none') {
				return [];
			}
			// 'local' の間は匿名の検索結果をローカルユーザーに限定する(users/show と同じ訪問者ポリシーの扱い)
			if (me == null && this.serverSettings.ugcVisibilityForVisitor === 'local') {
				ps.origin = 'local';
			}

			const users = await this.userSearchService.search(ps.query.trim(), me?.id ?? null, {
				offset: ps.offset,
				limit: ps.limit,
				origin: ps.origin,
			});

			return await this.userEntityService.packMany(users, me, { schema: ps.detail ? 'UserDetailed' : 'UserLite' });
		});
	}
}
