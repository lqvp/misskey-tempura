/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ReactionStatsCacheService } from '@/core/ReactionStatsCacheService.js';

export const meta = {
	tags: ['meta'],

	requireCredential: true,
	kind: 'read:account',

	res: {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				reaction: {
					type: 'string',
					optional: false,
				},
				count: {
					type: 'number',
					optional: false,
				},
			},
		},
	},

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '27e494ba-2ac2-48e8-893b-10d4d8c2387b',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		site: { type: 'boolean', default: false },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private reactionStatsCache: ReactionStatsCacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const cacheKey = ps.site
				? 'site'
				: `user:${me.id}`;

			const res = await this.reactionStatsCache.fetch(cacheKey);

			return res;
		});
	}
}
