/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { SubAccountService } from '@/core/SubAccountService.js';

import { subAccountErrorMeta, toApiError } from '@/server/api/sub-account-errors.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,

	secure: true,
	denyForSubAccount: true,

	errors: subAccountErrorMeta,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		subId: { type: 'string', format: 'misskey:id' },
	},
	required: ['subId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private subAccountService: SubAccountService,

	) {
		super(meta, paramDef, async (ps, me) => {
			const sub = await this.subAccountService.getOwned(me, ps.subId).catch(e => { throw toApiError(e); });
			await this.subAccountService.regenerateToken(sub);
		});
	}
}
