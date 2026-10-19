/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { SigninsRepository } from '@/models/_.js';
import { QueryService } from '@/core/QueryService.js';
import { SigninEntityService } from '@/core/entities/SigninEntityService.js';
import { LoginRiskService } from '@/core/LoginRiskService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../error.js';

export const meta = {
	requireCredential: true,
	secure: true,

	description: 'Lists sign-in attempts of yourself that the login risk detection judged suspicious. Available only when the server shows these details to users.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Signin',
		},
	},

	errors: {
		notAvailable: {
			message: 'This server does not show login risk details to users.',
			code: 'NOT_AVAILABLE',
			id: 'c614de8d-5423-450b-9cea-e88da2a7e962',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.signinsRepository)
		private signinsRepository: SigninsRepository,

		private signinEntityService: SigninEntityService,
		private queryService: QueryService,
		private loginRiskService: LoginRiskService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (!this.loginRiskService.isDetailVisibleToUser()) {
				throw new ApiError(meta.errors.notAvailable);
			}

			const query = this.queryService.makePaginationQuery(this.signinsRepository.createQueryBuilder('signin'), ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
				.andWhere('signin.userId = :meId', { meId: me.id });
			this.loginRiskService.filterSuspiciousSignins(query, 'signin');

			const history = await query.limit(ps.limit).getMany();

			return await Promise.all(history.map(record => this.signinEntityService.pack(record)));
		});
	}
}
