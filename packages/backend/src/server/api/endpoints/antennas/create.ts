/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { IdService } from '@/core/IdService.js';
import type { UserListsRepository, AntennasRepository } from '@/models/_.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { AntennaEntityService } from '@/core/entities/AntennaEntityService.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';
import { REGEX_GROUP_LIMIT, REGEX_KEYWORDS_PER_GROUP_LIMIT, REGEX_PATTERN_MAX_LENGTH, findAntennaKeywordLimitViolation, validateAntennaRegexKeywords } from '@/misc/antenna-regex.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['antennas'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:account',

	errors: {
		noSuchUserList: {
			message: 'No such user list.',
			code: 'NO_SUCH_USER_LIST',
			id: '95063e93-a283-4b8b-9aa5-bcdb8df69a7f',
		},

		tooManyAntennas: {
			message: 'You cannot create antenna any more.',
			code: 'TOO_MANY_ANTENNAS',
			id: 'faf47050-e8b5-438c-913c-db2b1576fde4',
		},

		emptyKeyword: {
			message: 'Either keywords or excludeKeywords is required.',
			code: 'EMPTY_KEYWORD',
			id: '53ee222e-1ddd-4f9a-92e5-9fb82ddb463a',
		},

		invalidRegex: {
			message: 'Invalid regular expression.',
			code: 'INVALID_REGEX',
			id: '03534a02-f779-456a-bcf2-d4e490401bfa',
		},

		keywordLimitExceeded: {
			message: 'Too many keywords.',
			code: 'KEYWORD_LIMIT_EXCEEDED',
			id: '4b8e2f61-7d3a-49c5-a0e8-1f6c9b2d7e43',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'Antenna',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 1, maxLength: 100 },
		src: { type: 'string', enum: ['home', 'all', 'users', 'list', 'users_blacklist'] },
		userListId: { type: 'string', format: 'misskey:id', nullable: true },
		// 受信経路はノートごとに全キーワードを走査するため、モードに関係なく上限を揃える
		keywords: { type: 'array', maxItems: REGEX_GROUP_LIMIT, items: {
			type: 'array', maxItems: REGEX_KEYWORDS_PER_GROUP_LIMIT, items: {
				type: 'string', maxLength: REGEX_PATTERN_MAX_LENGTH,
			},
		} },
		excludeKeywords: { type: 'array', maxItems: REGEX_GROUP_LIMIT, items: {
			type: 'array', maxItems: REGEX_KEYWORDS_PER_GROUP_LIMIT, items: {
				type: 'string', maxLength: REGEX_PATTERN_MAX_LENGTH,
			},
		} },
		mustExcludeKeywords: { type: 'array', maxItems: REGEX_GROUP_LIMIT, items: {
			type: 'array', maxItems: REGEX_KEYWORDS_PER_GROUP_LIMIT, items: {
				type: 'string', maxLength: REGEX_PATTERN_MAX_LENGTH,
			},
		} },
		expression: { type: 'string', nullable: true, maxLength: 2048 },
		keywordMode: { type: 'string', enum: ['literal', 'regex'] },
		users: { type: 'array', items: {
			type: 'string',
		} },
		caseSensitive: { type: 'boolean' },
		localOnly: { type: 'boolean' },
		excludeBots: { type: 'boolean' },
		withReplies: { type: 'boolean' },
		withFile: { type: 'boolean' },
		excludeNotesInSensitiveChannel: { type: 'boolean' },
		onlyFollowers: { type: 'boolean' },
	},
	required: ['name', 'src', 'keywords', 'excludeKeywords', 'users', 'caseSensitive', 'withReplies', 'withFile'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.antennasRepository)
		private antennasRepository: AntennasRepository,

		@Inject(DI.userListsRepository)
		private userListsRepository: UserListsRepository,

		private antennaEntityService: AntennaEntityService,
		private roleService: RoleService,
		private idService: IdService,
		private globalEventService: GlobalEventService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.keywords.flat().every(x => x === '') && ps.excludeKeywords.flat().every(x => x === '')) {
				throw new ApiError(meta.errors.emptyKeyword);
			}

			// 上限はモードに関係なく課す (受信経路はノートごとに全キーワードを走査するため)。
			// ただし paramDef 側でも同じ上限を課しているので、通常はここに来る前に INVALID_PARAM になる
			const keywordGroups = [ps.keywords, ps.excludeKeywords, ps.mustExcludeKeywords ?? []];
			const limitViolation = findAntennaKeywordLimitViolation(keywordGroups);
			if (limitViolation != null) {
				throw new ApiError(meta.errors.keywordLimitExceeded, { reason: limitViolation.reason, pattern: limitViolation.pattern, location: limitViolation.location });
			}

			const keywordMode = ps.keywordMode ?? 'literal';
			if (keywordMode === 'regex') {
				const regexError = validateAntennaRegexKeywords(keywordGroups);
				if (regexError != null) {
					throw new ApiError(meta.errors.invalidRegex, { reason: regexError.reason, pattern: regexError.pattern, detail: regexError.message, location: regexError.location });
				}
			}

			const currentAntennasCount = await this.antennasRepository.countBy({
				userId: me.id,
			});
			if (currentAntennasCount >= (await this.roleService.getUserPolicies(me.id)).antennaLimit) {
				throw new ApiError(meta.errors.tooManyAntennas);
			}

			let userList;

			if (ps.src === 'list' && ps.userListId) {
				userList = await this.userListsRepository.findOneBy({
					id: ps.userListId,
					userId: me.id,
				});

				if (userList == null) {
					throw new ApiError(meta.errors.noSuchUserList);
				}
			}

			const now = new Date();

			const antenna = await this.antennasRepository.insertOne({
				id: this.idService.gen(now.getTime()),
				lastUsedAt: now,
				userId: me.id,
				name: ps.name,
				src: ps.src,
				userListId: userList ? userList.id : null,
				keywords: ps.keywords,
				excludeKeywords: ps.excludeKeywords,
				mustExcludeKeywords: ps.mustExcludeKeywords ?? [],
				expression: ps.expression,
				keywordMode,
				users: ps.users,
				caseSensitive: ps.caseSensitive,
				localOnly: ps.localOnly,
				excludeBots: ps.excludeBots,
				withReplies: ps.withReplies,
				withFile: ps.withFile,
				excludeNotesInSensitiveChannel: ps.excludeNotesInSensitiveChannel,
				onlyFollowers: ps.onlyFollowers,
			});

			this.globalEventService.publishInternalEvent('antennaCreated', antenna);

			return await this.antennaEntityService.pack(antenna);
		});
	}
}
