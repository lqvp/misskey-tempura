/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { SearchService } from '@/core/SearchService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { RoleService } from '@/core/RoleService.js';
import { IdService } from '@/core/IdService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: false,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},

	errors: {
		unavailable: {
			message: 'Search of notes unavailable.',
			code: 'UNAVAILABLE',
			id: '0b44998d-77aa-4427-80d0-d2c9b8523011',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: { type: 'string', minLength: 0, default: '' },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
		host: {
			type: 'string',
			description: 'The local host is represented with `.`.',
		},
		userId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		channelId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		visibility: {
			type: 'string',
			enum: ['all', 'public', 'home', 'followers', 'specified'],
			default: 'all',
		},
		hasFiles: {
			type: 'string',
			enum: ['all', 'with', 'without'],
			default: 'all',
		},
		hasCw: {
			type: 'string',
			enum: ['all', 'with', 'without'],
			default: 'all',
		},
		hasReply: {
			type: 'string',
			enum: ['all', 'with', 'without'],
			default: 'all',
		},
		hasPoll: {
			type: 'string',
			enum: ['all', 'with', 'without'],
			default: 'all',
		},
		searchOperator: {
			type: 'string',
			enum: ['and', 'or'],
			default: 'and',
		},
		excludeWords: {
			type: 'array',
			items: { type: 'string' },
			default: [],
		},
	},
	required: [],
} as const;

// TODO: ロジックをサービスに切り出す

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private noteEntityService: NoteEntityService,
		private searchService: SearchService,
		private roleService: RoleService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const untilId = ps.untilId ?? (ps.untilDate ? this.idService.gen(ps.untilDate!) : undefined);
			const sinceId = ps.sinceId ?? (ps.sinceDate ? this.idService.gen(ps.sinceDate!) : undefined);

			const policies = await this.roleService.getUserPolicies(me ? me.id : null);
			if (!policies.canSearchNotes) {
				throw new ApiError(meta.errors.unavailable);
			}

			// 検索クエリの構築
			let searchQuery = ps.query;

			// 複数の検索語がある場合
			if (ps.query) {
				const terms = ps.query.split(' ').map((term: string) => {
					// URLエンコードされた文字列のみをデコード
					try {
						return decodeURIComponent(term).trim();
					} catch {
						// デコードに失敗した場合は元の文字列を使用
						return term.trim();
					}
				}).filter((term: string) => term !== '');
				if (terms.length > 0) {
					if (ps.searchOperator === 'and') {
						// AND検索: すべての語を含む
						searchQuery = terms.join(' ');
					} else {
						// OR検索: いずれかの語を含む
						searchQuery = terms.join(' OR ');
					}
				}
			}

			const notes = await this.searchService.searchNote(searchQuery, me, {
				userId: ps.userId,
				channelId: ps.channelId,
				host: ps.host,
				visibility: ps.visibility,
				hasFiles: ps.hasFiles,
				hasCw: ps.hasCw,
				hasReply: ps.hasReply,
				hasPoll: ps.hasPoll,
				searchOperator: ps.searchOperator,
				excludeWords: ps.excludeWords,
				sinceDate: ps.sinceDate,
				untilDate: ps.untilDate,
			}, {
				untilId: untilId,
				sinceId: sinceId,
				limit: ps.limit,
			});

			return await this.noteEntityService.packMany(notes, me);
		});
	}
}
