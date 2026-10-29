/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { EmojisRepository, MiMeta } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UtilityService } from '@/core/UtilityService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['meta'],

	requireCredential: true,

	kind: 'read:account',

	limit: {
		duration: 1000 * 60,
		max: 60,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			emojis: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						name: {
							type: 'string',
							optional: false, nullable: false,
						},
						host: {
							type: 'string',
							optional: false, nullable: false,
						},
						url: {
							type: 'string',
							optional: false, nullable: false,
						},
						aliases: {
							type: 'array',
							optional: false, nullable: false,
							items: {
								type: 'string',
								optional: false, nullable: false,
							},
						},
						isSensitive: {
							type: 'boolean',
							optional: false, nullable: false,
						},
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: { type: 'string', minLength: 1, maxLength: 128 },
		host: { type: 'string', nullable: true, maxLength: 128 },
		limit: { type: 'integer', minimum: 1, maximum: 50, default: 30 },
	},
	required: ['query'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.emojisRepository)
		private emojisRepository: EmojisRepository,

		private utilityService: UtilityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const host = ps.host != null && ps.host !== '' ? this.utilityService.toPuny(ps.host) : null;

			const queryBuilder = this.emojisRepository.createQueryBuilder('emoji')
				.where('emoji.host IS NOT NULL')
				.andWhere('(emoji.name ILIKE :query OR :exact = ANY(emoji.aliases))', {
					query: `%${ps.query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`,
					exact: ps.query,
				})
				.take(100);

			if (host != null) {
				if (!this.utilityService.isSelfHost(host)) {
					queryBuilder.andWhere('emoji.host = :host', { host });
				} else {
					// 自ホスト指定はリモート検索では常に空
					return { emojis: [] };
				}
			}

			let emojis = await queryBuilder.getMany();

			// メディアサイレンスされたホストは除外
			emojis = emojis.filter(x => !this.utilityService.isMediaSilencedHost(this.serverSettings.mediaSilencedHosts, x.host));

			const lowerQuery = ps.query.toLowerCase();
			emojis.sort((a, b) => {
				const score = (x: typeof a) =>
					x.name.toLowerCase() === lowerQuery ? 0
						: x.name.toLowerCase().startsWith(lowerQuery) ? 1
							: 2;
				const diff = score(a) - score(b);
				if (diff !== 0) return diff;
				return (a.name + a.host).localeCompare(b.name + b.host);
			});

			return {
				emojis: emojis.slice(0, ps.limit).map(x => ({
					name: x.name,
					host: x.host!,
					url: x.publicUrl || x.originalUrl, // || x.originalUrl してるのは後方互換性のため（publicUrlはstringなので??はだめ）
					aliases: x.aliases,
					isSensitive: x.isSensitive,
				})),
			};
		});
	}
}
