/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { getJsonSchema } from '@/core/chart/core.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { MiMeta } from '@/models/_.js';
import UsersChart from '@/core/chart/charts/users.js';
import { schema } from '@/core/chart/charts/entities/users.js';

export const meta = {
	tags: ['charts', 'users'],

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
		private usersChart: UsersChart,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (!me && !this.serverSettings.allowAnonymousChartUsers) {
				return { local: { total: [], inc: [], dec: [] }, remote: { total: [], inc: [], dec: [] } };
			};
			return await this.usersChart.getChart(ps.span, ps.limit, ps.offset ? new Date(ps.offset) : null);
		});
	}
}
