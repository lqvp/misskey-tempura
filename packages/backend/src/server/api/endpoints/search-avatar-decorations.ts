/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AvatarDecorationService } from '@/core/AvatarDecorationService.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { RoleService } from '@/core/RoleService.js';

export const meta = {
	tags: ['avatar-decorations'],

	requireCredential: true,
	kind: 'read:account',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: { type: 'string' },
				name: { type: 'string' },
				description: { type: 'string', nullable: true },
				url: { type: 'string' },
				roleIdsThatCanBeUsedThisDecoration: { type: 'array', items: { type: 'string' } },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: { type: 'string' },
		origin: { type: 'string', enum: ['local', 'remote', 'combined'], default: 'combined' },
		host: { type: 'string', nullable: true },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
	},
	required: ['query'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private avatarDecorationService: AvatarDecorationService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const decorations = await this.avatarDecorationService.getAll(true);
			const query = sqlLikeEscape(ps.query.toLowerCase()); // 検索クエリを小文字に変換

			// ユーザーの権限を事前に取得
			const policies = me ? await this.roleService.getUserPolicies(me.id) : null;

			let filtered = decorations.filter(decoration => {
				const matchesQuery = decoration.name.toLowerCase().includes(query) ||
					(decoration.description && decoration.description.toLowerCase().includes(query));

				const isRemote = decoration.name.startsWith('import_');
				const isLocal = !isRemote;

				return matchesQuery &&
					(ps.origin === 'combined' ||
					(ps.origin === 'local' && isLocal) ||
					(ps.origin === 'remote' && isRemote && (!me || (policies && policies.canUseRemoteIconDecorations)))) &&
					(!ps.host || !isRemote || decoration.name.split('_')[1] === ps.host);
			});

			// ソート: ローカルデコレーションを優先し、その後は名前順
			filtered.sort((a, b) => {
				const aIsRemote = a.name.startsWith('import_');
				const bIsRemote = b.name.startsWith('import_');
				if (aIsRemote !== bIsRemote) return aIsRemote ? 1 : -1;
				return a.name.localeCompare(b.name);
			});

			// ページネーション
			filtered = filtered.slice(ps.offset, ps.offset + ps.limit);

			return filtered;
		});
	}
}
