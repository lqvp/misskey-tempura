/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { NoteReactionsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteReactionEntityService } from '@/core/entities/NoteReactionEntityService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { CacheService } from '@/core/CacheService.js';
import { RoleService } from '@/core/RoleService.js';
import { IdService } from '@/core/IdService.js';
import { shouldHideNoteByTime } from '@/misc/should-hide-note-by-time.js';
import { GetterService } from '@/server/api/GetterService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes', 'reactions'],

	requireCredential: false,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'NoteReaction',
		},
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '263fff3d-d0e1-4af4-bea7-8408059b451a',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		type: { type: 'string', nullable: true },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: ['noteId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.noteReactionsRepository)
		private noteReactionsRepository: NoteReactionsRepository,

		private noteReactionEntityService: NoteReactionEntityService,
		private noteEntityService: NoteEntityService,
		private queryService: QueryService,
		private cacheService: CacheService,
		private idService: IdService,
		private roleService: RoleService,
		private getterService: GetterService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (!me) {
				return [];
			};
			const note = await this.getterService.getNote(ps.noteId).catch(err => {
				if (err.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
				throw err;
			});

			if (!await this.noteEntityService.isVisibleForMe(note, me ? me.id : null)) {
				throw new ApiError(meta.errors.noSuchNote);
			}

			// User-level privacy gates (same checks as shouldHideNote; the
			// author themselves and admins are exempt, mirroring shouldHideNote).
			// Anonymous callers already return [] above, and the remaining
			// shouldHideNote checks are anonymous-only, so the checks below
			// are exactly the ones reachable for authenticated callers.
			if (!await this.roleService.isAdministrator(me) && me.id !== note.userId) {
				const createdAt = this.idService.parse(note.id).date.toISOString();
				const author = await this.cacheService.findUserById(note.userId);
				if (shouldHideNoteByTime(author.makeNotesHiddenBefore, createdAt)) {
					throw new ApiError(meta.errors.noSuchNote);
				}
				if ((note.visibility === 'public' || note.visibility === 'home') &&
					shouldHideNoteByTime(author.makeNotesFollowersOnlyBefore, createdAt) &&
					!await this.noteEntityService.isVisibleForMe({ ...note, visibility: 'followers' as const }, me.id)) {
					// public/home note demoted to followers-only and caller is not eligible
					throw new ApiError(meta.errors.noSuchNote);
				}
				// note: requireSigninToViewContents / hidePublicNotes / hideHomeNotes /
				// hideLocalOnlyNotes apply to anonymous callers only, and anonymous
				// callers already returned [] above — no checks needed here.
			}

			const query = this.queryService.makePaginationQuery(this.noteReactionsRepository.createQueryBuilder('reaction'), ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
				.andWhere('reaction.noteId = :noteId', { noteId: note.id })
				.leftJoinAndSelect('reaction.user', 'user')
				.leftJoinAndSelect('reaction.note', 'note');

			if (me != null) {
				const [userIdsWhoMeMuting, userIdsWhoBlockingMe] = await Promise.all([
					this.cacheService.userMutingsCache.get(me.id),
					this.cacheService.userBlockedCache.get(me.id),
				]);

				const userIdsWhoMeMutingOrBlocking = Array.from(userIdsWhoMeMuting ?? []).concat(Array.from(userIdsWhoBlockingMe ?? []));
				if (userIdsWhoMeMutingOrBlocking.length > 0 ) {
			  	query.andWhere('reaction.userId NOT IN (:...userIds)', { userIds: userIdsWhoMeMutingOrBlocking });
				}
			}

			if (ps.type) {
				// ローカルリアクションはホスト名が . とされているが
				// DB 上ではそうではないので、必要に応じて変換
				const suffix = '@.:';
				const type = ps.type.endsWith(suffix) ? ps.type.slice(0, ps.type.length - suffix.length) + ':' : ps.type;
				query.andWhere('reaction.reaction = :type', { type });
			}

			const reactions = await query.limit(ps.limit).getMany();

			return await this.noteReactionEntityService.packMany(reactions, me);
		});
	}
}
