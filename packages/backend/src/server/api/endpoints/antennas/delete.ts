/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { AntennasRepository } from '@/models/_.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['antennas'],

	requireCredential: true,

	kind: 'write:account',

	errors: {
		noSuchAntenna: {
			message: 'No such antenna.',
			code: 'NO_SUCH_ANTENNA',
			id: 'b34dcf9d-348f-44bb-99d0-6c9314cfe2df',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		antennaId: { type: 'string', format: 'misskey:id' },
	},
	required: ['antennaId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.antennasRepository)
		private antennasRepository: AntennasRepository,

		private globalEventService: GlobalEventService,
		private fanoutTimelineService: FanoutTimelineService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const antenna = await this.antennasRepository.findOneBy({
				id: ps.antennaId,
				userId: me.id,
			});

			if (antenna == null) {
				throw new ApiError(meta.errors.noSuchAntenna);
			}

			await this.antennasRepository.delete(antenna.id);

			// アンテナに紐づく Redis の状態を片付ける。
			// 残すとメモリがアンテナ数だけ増え続け、ID が再利用された場合に古い記録を引きずる
			const timelineName = `antennaTimeline:${antenna.id}` as const;
			await Promise.all([
				this.fanoutTimelineService.purge(timelineName),
				this.fanoutTimelineService.purgeRemoved(timelineName),
			]);

			this.globalEventService.publishInternalEvent('antennaDeleted', antenna);
		});
	}
}
