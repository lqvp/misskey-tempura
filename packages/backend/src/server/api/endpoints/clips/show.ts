/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { ClipFavoritesRemoteRepository, ClipsRepository } from '@/models/_.js';
import { ClipEntityService } from '@/core/entities/ClipEntityService.js';
import { DI } from '@/di-symbols.js';
import { ClipService } from '@/core/ClipService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['clips', 'account'],

	requireCredential: false,

	kind: 'read:account',

	errors: {
		noSuchClip: {
			message: 'No such clip.',
			code: 'NO_SUCH_CLIP',
			id: 'c3c5fe33-d62c-44d2-9ea5-d997703f5c20',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'Clip',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		clipId: { type: 'string', format: 'misskey:id' },
	},
	required: ['clipId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.clipsRepository)
		private clipsRepository: ClipsRepository,
		@Inject(DI.clipFavoritesRemoteRepository)
		private clipFavoritesRemoteRepository: ClipFavoritesRemoteRepository,

		private clipService: ClipService,
		private clipEntityService: ClipEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const parsed_id = ps.clipId.split('@');
			if (parsed_id.length === 2 ) {//is remote
				const clip = await clipService.showRemote(parsed_id[0], parsed_id[1], true).catch(err => {
					console.error(err);
					throw new ApiError(meta.errors.failedToResolveRemoteUser);
				});
				if (me) {
					const exist = await this.clipFavoritesRemoteRepository.exists({
						where: {
							clipId: parsed_id[0],
							host: parsed_id[1],
							userId: me.id,
						},
					});
					if (exist) {
						clip.isFavorited = true;
					}
				}
				return clip;
			}
			if (parsed_id.length !== 1 ) {//is not local
				throw new ApiError(meta.errors.invalidIdFormat);
			}
			// Fetch the clip
			const clip = await this.clipsRepository.findOneBy({
				id: ps.clipId,
			});

			if (clip == null) {
				throw new ApiError(meta.errors.noSuchClip);
			}

			if (!clip.isPublic && (me == null || (clip.userId !== me.id))) {
				throw new ApiError(meta.errors.noSuchClip);
			}

			return await this.clipEntityService.pack(clip, me);
		});
	}
}

