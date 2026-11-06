/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { AntennasRepository, UserListsRepository } from '@/models/_.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { AntennaEntityService } from '@/core/entities/AntennaEntityService.js';
import { DI } from '@/di-symbols.js';
import { validateAntennaRegexKeywords } from '@/misc/antenna-regex.js';
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
		@Inject(DI.antennasRepository)
		private antennasRepository: AntennasRepository,

		@Inject(DI.userListsRepository)
		private userListsRepository: UserListsRepository,

		private antennaEntityService: AntennaEntityService,
		private globalEventService: GlobalEventService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.keywords && ps.excludeKeywords) {
				if (ps.keywords.flat().every(x => x === '') && ps.excludeKeywords.flat().every(x => x === '')) {
					throw new ApiError(meta.errors.emptyKeyword);
				}
			}
			// Fetch the antenna
			const antenna = await this.antennasRepository.findOneBy({
				id: ps.antennaId,
				userId: me.id,
			});

			if (antenna == null) {
				throw new ApiError(meta.errors.noSuchAntenna);
			}

			// 切替後のmodeで、切替後に有効になるキーワード群全体を検証する (未指定の項目は保存済みの値)
			const keywordMode = ps.keywordMode ?? antenna.keywordMode;
			if (keywordMode === 'regex') {
				const regexError = validateAntennaRegexKeywords([
					ps.keywords ?? antenna.keywords,
					ps.excludeKeywords ?? antenna.excludeKeywords,
					ps.mustExcludeKeywords ?? antenna.mustExcludeKeywords,
				]);
				if (regexError != null) {
					throw new ApiError(meta.errors.invalidRegex, { reason: regexError.reason, pattern: regexError.pattern, detail: regexError.message });
				}
			}

			let userList;

			if ((ps.src === 'list' || antenna.src === 'list') && ps.userListId) {
				userList = await this.userListsRepository.findOneBy({
					id: ps.userListId,
					userId: me.id,
				});

				if (userList == null) {
					throw new ApiError(meta.errors.noSuchUserList);
				}
			}

			await this.antennasRepository.update(antenna.id, {
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

			this.globalEventService.publishInternalEvent('antennaUpdated', await this.antennasRepository.findOneByOrFail({ id: antenna.id }));

			return await this.antennaEntityService.pack(antenna.id);
		});
	}
}
