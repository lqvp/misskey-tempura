/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { NotesRepository, UserListsRepository } from '@/models/_.js';
import { QueryService } from '@/core/QueryService.js';
import { AntennaService } from '@/core/AntennaService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { findAntennaKeywordLimitViolation, validateAntennaRegexKeywords } from '@/misc/antenna-regex.js';
import { DI } from '@/di-symbols.js';
import type { MiAntenna } from '@/models/Antenna.js';
import type { MiNote } from '@/models/Note.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['antennas', 'account', 'notes'],

	requireCredential: true,

	limit: {
		duration: ms('1min'),
		max: 10,
	},

	kind: 'read:account',

	errors: {
		noSuchUserList: {
			message: 'No such user list.',
			code: 'NO_SUCH_USER_LIST',
			id: 'e2a1c4f6-8b3d-4e5a-9c7b-1d2e3f4a5b6c',
		},

		emptyKeyword: {
			message: 'Either keywords or excludeKeywords is required.',
			code: 'EMPTY_KEYWORD',
			id: 'b3f9a1c2-4d5e-4f6a-8b7c-9d0e1f2a3b4c',
		},

		invalidRegex: {
			message: 'Invalid regular expression.',
			code: 'INVALID_REGEX',
			id: '0718cd93-e139-48f9-8107-2f5b24ad3669',
		},

		keywordLimitExceeded: {
			message: 'Too many keywords.',
			code: 'KEYWORD_LIMIT_EXCEEDED',
			id: '2e7a5c94-8f13-4d6b-b0a2-7c4e1d9f3b58',
		},
	},

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		src: { type: 'string', enum: ['home', 'all', 'users', 'list', 'users_blacklist'] },
		userListId: { type: 'string', format: 'misskey:id', nullable: true },
		// 上限は paramDef ではなくハンドラで判定する (create と同じ理由: どの項目が超過しているかを返すため)
		keywords: { type: 'array', items: {
			type: 'array', items: {
				type: 'string',
			},
		} },
		excludeKeywords: { type: 'array', items: {
			type: 'array', items: {
				type: 'string',
			},
		} },
		mustExcludeKeywords: { type: 'array', items: {
			type: 'array', items: {
				type: 'string',
			},
		} },
		expression: { type: 'string', nullable: true, maxLength: 2048 },
		keywordMode: { type: 'string', enum: ['literal', 'regex'] },
		users: { type: 'array', maxItems: 100, items: {
			type: 'string', maxLength: 300,
		} },
		caseSensitive: { type: 'boolean' },
		localOnly: { type: 'boolean' },
		excludeBots: { type: 'boolean' },
		withReplies: { type: 'boolean' },
		withFile: { type: 'boolean' },
		excludeNotesInSensitiveChannel: { type: 'boolean' },
		onlyFollowers: { type: 'boolean' },
		limit: { type: 'integer', minimum: 1, maximum: 30, default: 10 },
	},
	required: ['src', 'keywords', 'excludeKeywords', 'users', 'caseSensitive', 'withReplies', 'withFile'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.userListsRepository)
		private userListsRepository: UserListsRepository,

		private antennaService: AntennaService,
		private noteEntityService: NoteEntityService,
		private queryService: QueryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.keywords.flat().every(x => x === '') && ps.excludeKeywords.flat().every(x => x === '')) {
				throw new ApiError(meta.errors.emptyKeyword);
			}

			// 保存 (create) と同じ検証を通す。試し打ちだけ通って保存で失敗すると、結果を信じて保存したユーザーが混乱するため
			// 強制除外キーワードは SCORE モードでしか使われないので、使われないときは検証しない
			const keywordGroups = ps.expression === 'SCORE'
				? [ps.keywords, ps.excludeKeywords, ps.mustExcludeKeywords ?? []]
				: [ps.keywords, ps.excludeKeywords];
			const limitViolation = findAntennaKeywordLimitViolation(keywordGroups);
			if (limitViolation != null) {
				throw new ApiError(meta.errors.keywordLimitExceeded, { reason: limitViolation.reason, pattern: limitViolation.pattern, location: limitViolation.location });
			}

			if ((ps.keywordMode ?? 'literal') === 'regex') {
				const regexError = validateAntennaRegexKeywords(keywordGroups);
				if (regexError != null) {
					throw new ApiError(meta.errors.invalidRegex, { reason: regexError.reason, pattern: regexError.pattern, detail: regexError.message, location: regexError.location });
				}
			}

			if (ps.src === 'list' && ps.userListId) {
				const userList = await this.userListsRepository.findOneBy({
					id: ps.userListId,
					userId: me.id,
				});

				if (userList == null) {
					throw new ApiError(meta.errors.noSuchUserList);
				}
			}

			const pseudoAntenna = {
				id: '0000000000',
				userId: me.id,
				name: '',
				src: ps.src,
				userListId: ps.src === 'list' ? ps.userListId ?? null : null,
				keywords: ps.keywords,
				excludeKeywords: ps.excludeKeywords,
				mustExcludeKeywords: ps.mustExcludeKeywords ?? [],
				expression: ps.expression ?? null,
				keywordMode: ps.keywordMode ?? 'literal',
				users: ps.users,
				caseSensitive: ps.caseSensitive,
				localOnly: ps.localOnly,
				excludeBots: ps.excludeBots,
				withReplies: ps.withReplies,
				withFile: ps.withFile,
				excludeNotesInSensitiveChannel: ps.excludeNotesInSensitiveChannel,
				onlyFollowers: ps.onlyFollowers,
				isActive: true,
				lastUsedAt: new Date(),
			} as unknown as MiAntenna;

			// 試し打ちの対象は自分に見える直近のノート(最大200件)。
			// 公開範囲とミュート/ブロックのフィルタを必ず通すので、フォロワー限定やダイレクトなど見えないはずのノートは返らない。
			const query = this.notesRepository.createQueryBuilder('note')
				.innerJoinAndSelect('note.user', 'user')
				.leftJoinAndSelect('note.reply', 'reply')
				.leftJoinAndSelect('note.renote', 'renote')
				.leftJoinAndSelect('note.channel', 'channel')
				.leftJoinAndSelect('reply.user', 'replyUser')
				.leftJoinAndSelect('renote.user', 'renoteUser')
				.orderBy('note.id', 'DESC')
				.take(200);

			this.queryService.generateVisibilityQuery(query, me);
			this.queryService.generateBaseNoteFilteringQuery(query, me);

			const candidates = await query.getMany();

			const matched: MiNote[] = [];
			for (const note of candidates) {
				if (note.user == null) continue;
				if (await this.antennaService.checkHitAntenna(pseudoAntenna, note, note.user)) {
					matched.push(note);
					if (matched.length >= ps.limit) break;
				}
			}

			return await this.noteEntityService.packMany(matched, me);
		});
	}
}
