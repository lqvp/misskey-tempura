/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { IdService } from '@/core/IdService.js';
import { AvatarDecorationService } from '@/core/AvatarDecorationService.js';
import { filterAvatarDecorations } from '@/misc/filter-avatar-decorations.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requiredRolePolicy: 'canManageAvatarDecorations',
	kind: 'read:admin:avatar-decorations',

	description: 'Search avatar decorations for management. Unlike search-avatar-decorations, imported (remote) decorations are always included.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: {
					type: 'string',
					optional: false, nullable: false,
					format: 'id',
					example: 'xxxxxxxxxx',
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
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: { type: 'string', default: '' },
		origin: { type: 'string', enum: ['local', 'remote', 'combined'], default: 'combined' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		offset: { type: 'integer', minimum: 0, default: 0 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private avatarDecorationService: AvatarDecorationService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps) => {
			const decorations = await this.avatarDecorationService.getAll(true);
			const filtered = filterAvatarDecorations(decorations, { query: ps.query, origin: ps.origin });

			return filtered.slice(ps.offset, ps.offset + ps.limit).map(decoration => ({
				id: decoration.id,
				createdAt: this.idService.parse(decoration.id).date.toISOString(),
				updatedAt: decoration.updatedAt?.toISOString() ?? null,
				name: decoration.name,
				description: decoration.description,
				url: decoration.url,
				roleIdsThatCanBeUsedThisDecoration: decoration.roleIdsThatCanBeUsedThisDecoration,
				category: decoration.category,
			}));
		});
	}
}
