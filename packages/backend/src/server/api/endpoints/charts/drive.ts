/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { getJsonSchema } from '@/core/chart/core.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { MiMeta } from '@/models/_.js';
import DriveChart from '@/core/chart/charts/drive.js';
import { schema } from '@/core/chart/charts/entities/drive.js';

export const meta = {
	tags: ['charts', 'drive'],

	res: getJsonSchema(schema),

	allowGet: true,
	// 匿名公開の設定変更が即時に反映されるよう、匿名応答はキャッシュさせない
	noStoreWhenAnonymous: true,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		span: { type: 'string', enum: ['day', 'hour'] },
		limit: { type: 'integer', minimum: 1, maximum: 500, default: 30 },
		offset: { type: 'integer', nullable: true, default: null },
	},
	required: ['span'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,
		private driveChart: DriveChart,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (!me && !this.serverSettings.allowAnonymousChartDrive) {
				return { local: { incCount: [], incSize: [], decCount: [], decSize: [] }, remote: { incCount: [], incSize: [], decCount: [], decSize: [] } };
			};
			return await this.driveChart.getChart(ps.span, ps.limit, ps.offset ? new Date(ps.offset) : null);
		});
	}
}
