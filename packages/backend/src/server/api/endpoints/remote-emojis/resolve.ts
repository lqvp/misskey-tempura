/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { EmojisRepository, MiMeta } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { NoteEmojiAliasService } from '@/core/NoteEmojiAliasService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['meta'],

	requireCredential: true,

	kind: 'write:account',

	limit: {
		duration: 1000 * 60 * 60,
		max: 120,
	},

	errors: {
		noSuchEmoji: {
			message: 'No such emoji.',
			code: 'NO_SUCH_EMOJI',
			id: 'b3ecb24f-3f55-482a-b9f9-c2303b6aa36b',
		},
		invalidHost: {
			message: 'Invalid host.',
			code: 'INVALID_HOST',
			id: '3d3533e0-a7f5-4f8a-a6c2-4b486a02589e',
		},
		mediaSilencedHost: {
			message: 'The host is media-silenced.',
			code: 'MEDIA_SILENCED_HOST',
			id: 'b6ce1878-7564-4bb2-afd3-f332d8276fb0',
		},
		localOnlyEmoji: {
			message: 'The emoji is localOnly on the origin host.',
			code: 'LOCAL_ONLY_EMOJI',
			id: '2eb08c76-b28f-451c-a879-3b381dba405e',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			alias: {
				type: 'string',
				optional: false, nullable: false,
				description: '連合向けの安全なショートコード。ノート本文では `:alias:` として使う',
			},
			name: {
				type: 'string',
				optional: false, nullable: false,
				description: '元絵文字のショートコード',
			},
			host: {
				type: 'string',
				optional: false, nullable: false,
				description: '元絵文字のホスト',
			},
			url: {
				type: 'string',
				optional: false, nullable: false,
			},
			isSensitive: {
				type: 'boolean',
				optional: false, nullable: false,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 1, maxLength: 128 },
		host: { type: 'string', minLength: 1, maxLength: 128 },
	},
	required: ['name', 'host'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.emojisRepository)
		private emojisRepository: EmojisRepository,

		private noteEmojiAliasService: NoteEmojiAliasService,
		private utilityService: UtilityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const host = this.utilityService.toPuny(ps.host);

			if (this.utilityService.isSelfHost(host)) {
				throw new ApiError(meta.errors.invalidHost);
			}

			if (this.utilityService.isMediaSilencedHost(this.serverSettings.mediaSilencedHosts, host)) {
				throw new ApiError(meta.errors.mediaSilencedHost);
			}

			const resolved = await this.noteEmojiAliasService.resolve(ps.name, host);

			if (resolved == null) {
				// localOnly の絵文字はサービス側で参照発行を拒否されるため、エラーを区別したい場合は絵文字自体の存在を確認する
				const emoji = await this.emojisRepository.findOneBy({ name: ps.name, host });
				if (emoji != null && emoji.localOnly) {
					throw new ApiError(meta.errors.localOnlyEmoji);
				}
				throw new ApiError(meta.errors.noSuchEmoji);
			}

			return {
				alias: resolved.alias.alias,
				name: resolved.alias.name,
				host: resolved.alias.host,
				url: resolved.alias.publicUrl || resolved.alias.originalUrl, // || originalUrl してるのは後方互換性のため（publicUrlはstringなので??はだめ）
				isSensitive: resolved.alias.isSensitive,
			};
		});
	}
}
