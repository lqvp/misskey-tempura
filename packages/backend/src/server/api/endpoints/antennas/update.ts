/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MiAntenna } from '@/models/Antenna.js';
import { MiUserList } from '@/models/UserList.js';
import type { AntennasRepository } from '@/models/_.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { AntennaEntityService } from '@/core/entities/AntennaEntityService.js';
import { DI } from '@/di-symbols.js';
import { REGEX_GROUP_LIMIT, REGEX_KEYWORDS_PER_GROUP_LIMIT, REGEX_PATTERN_MAX_LENGTH, findAntennaKeywordLimitViolation, measureAntennaKeywordLimitExcess, validateAntennaRegexKeywords } from '@/misc/antenna-regex.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['antennas'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:account',

	errors: {
		noSuchAntenna: {
			message: 'No such antenna.',
			code: 'NO_SUCH_ANTENNA',
			id: '10c673ac-8852-48eb-aa1f-f5b67f069290',
		},

		noSuchUserList: {
			message: 'No such user list.',
			code: 'NO_SUCH_USER_LIST',
			id: '1c6b35c9-943e-48c2-81e4-2844989407f7',
		},

		emptyKeyword: {
			message: 'Either keywords or excludeKeywords is required.',
			code: 'EMPTY_KEYWORD',
			id: '721aaff6-4e1b-4d88-8de6-877fae9f68c4',
		},

		invalidRegex: {
			message: 'Invalid regular expression.',
			code: 'INVALID_REGEX',
			id: '68573d35-69af-48dc-bd62-e2a059907cf5',
		},

		keywordLimitExceeded: {
			message: 'Too many keywords.',
			code: 'KEYWORD_LIMIT_EXCEEDED',
			id: '9c1f0d27-5b6e-4a83-9f21-6d3b8e4c1a70',
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
		antennaId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', minLength: 1, maxLength: 100 },
		src: { type: 'string', enum: ['home', 'all', 'users', 'list', 'users_blacklist'] },
		userListId: { type: 'string', format: 'misskey:id', nullable: true },
		// ここでは maxItems/maxLength を課さない。上限を超えたアンテナは従来のAPIで保存できているため、
		// paramDef で弾くと名前だけの変更も通らなくなる。上限はハンドラで「既存の超過分は維持可」として判定する
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
	required: ['antennaId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		private antennaEntityService: AntennaEntityService,
		private globalEventService: GlobalEventService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.keywords && ps.excludeKeywords) {
				if (ps.keywords.flat().every(x => x === '') && ps.excludeKeywords.flat().every(x => x === '')) {
					throw new ApiError(meta.errors.emptyKeyword);
				}
			}
			// モード切替とキーワード更新の並行リクエストで不正な式が保存されないよう、
			// 読み取り・検証・更新を行ロックつきの同一トランザクションで行う
			const antenna = await this.db.transaction(async (tx) => {
				const locked = await tx.findOne(MiAntenna, {
					where: { id: ps.antennaId, userId: me.id },
					lock: { mode: 'pessimistic_write' },
				});

				if (locked == null) {
					throw new ApiError(meta.errors.noSuchAntenna);
				}

				// 切替後のmodeで、切替後に有効になるキーワード群全体を検証する (未指定の項目は保存済みの値)
				const keywordMode = ps.keywordMode ?? locked.keywordMode;
				const nextKeywords = [
					ps.keywords ?? locked.keywords,
					ps.excludeKeywords ?? locked.excludeKeywords,
					ps.mustExcludeKeywords ?? locked.mustExcludeKeywords,
				];

				// 上限は新規に作る分にだけ課す。従来のAPIでは上限を超えるアンテナを保存できていたため、
				// 既に超過しているアンテナは「超過が増えない限り」保存できるようにする (名前だけの変更も通す)
				const limitViolation = findAntennaKeywordLimitViolation(nextKeywords);
				if (limitViolation != null) {
					const currentExcess = measureAntennaKeywordLimitExcess([locked.keywords, locked.excludeKeywords, locked.mustExcludeKeywords]);
					if (measureAntennaKeywordLimitExcess(nextKeywords) > currentExcess) {
						throw new ApiError(meta.errors.keywordLimitExceeded, { reason: limitViolation.reason, pattern: limitViolation.pattern, location: limitViolation.location });
					}
				}

				if (keywordMode === 'regex') {
					const regexError = validateAntennaRegexKeywords(nextKeywords);
					if (regexError != null) {
						throw new ApiError(meta.errors.invalidRegex, { reason: regexError.reason, pattern: regexError.pattern, detail: regexError.message, location: regexError.location });
					}
				}

				let userList;

				if ((ps.src === 'list' || locked.src === 'list') && ps.userListId) {
					userList = await tx.findOne(MiUserList, {
						where: { id: ps.userListId, userId: me.id },
					});

					if (userList == null) {
						throw new ApiError(meta.errors.noSuchUserList);
					}
				}

				await tx.update(MiAntenna, locked.id, {
					name: ps.name,
					src: ps.src,
					userListId: ps.userListId !== undefined ? userList ? userList.id : null : undefined,
					keywords: ps.keywords,
					excludeKeywords: ps.excludeKeywords,
					mustExcludeKeywords: ps.mustExcludeKeywords,
					expression: ps.expression,
					keywordMode: ps.keywordMode,
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
				});

				return locked;
			});

			this.globalEventService.publishInternalEvent('antennaUpdated', await this.db.getRepository(MiAntenna).findOneByOrFail({ id: antenna.id }));

			return await this.antennaEntityService.pack(antenna.id);
		});
	}
}
