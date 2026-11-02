/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { NotesRepository, AntennasRepository } from '@/models/_.js';
import { QueryService } from '@/core/QueryService.js';
import { AntennaService } from '@/core/AntennaService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['antennas', 'account', 'notes'],

	requireCredential: true,

	kind: 'read:account',

	errors: {
		noSuchAntenna: {
			message: 'No such antenna.',
			code: 'NO_SUCH_ANTENNA',
			id: '5d7f2c8e-3f6a-4b1e-9a2c-7e4d8f1a3b5c',
		},
	},

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				noteId: { type: 'string', format: 'misskey:id', optional: false, nullable: false },
				matchedKeywords: {
					type: 'array',
					optional: false, nullable: false,
					items: {
						type: 'array',
						optional: false, nullable: false,
						items: { type: 'string', optional: false, nullable: false },
					},
				},
				matchedExcludeKeywords: {
					type: 'array',
					optional: false, nullable: false,
					items: {
						type: 'array',
						optional: false, nullable: false,
						items: { type: 'string', optional: false, nullable: false },
					},
				},
			},
			required: ['noteId', 'matchedKeywords', 'matchedExcludeKeywords'],
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		antennaId: { type: 'string', format: 'misskey:id' },
		noteIds: {
			type: 'array',
			items: { type: 'string', format: 'misskey:id' },
			minItems: 1,
			maxItems: 100,
		},
	},
	required: ['antennaId', 'noteIds'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.antennasRepository)
		private antennasRepository: AntennasRepository,

		private antennaService: AntennaService,
		private queryService: QueryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const antenna = await this.antennasRepository.findOneBy({
				id: ps.antennaId,
				userId: me.id,
			});

			if (antenna == null) {
				throw new ApiError(meta.errors.noSuchAntenna);
			}

			// 見えないノートのマッチ情報は返さない(取得側と同じフィルタを通す)
			const query = this.notesRepository.createQueryBuilder('note')
				.where('note.id IN (:...noteIds)', { noteIds: ps.noteIds })
				.innerJoinAndSelect('note.user', 'user');

			this.queryService.generateVisibilityQuery(query, me);
			this.queryService.generateBaseNoteFilteringQuery(query, me);

			const notes = await query.getMany();

			// 現在の条件で再計算する。受信当時の理由の復元ではないことに注意
			return notes.map(note => ({
				noteId: note.id,
				...this.antennaService.getAntennaMatchInfo(antenna, note),
			}));
		});
	}
}
