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
	prohibitMoved: true,

	kind: 'write:account',

	errors: subAccountErrorMeta,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		// required for a main account; a sub-account can only change itself
		subId: { type: 'string', format: 'misskey:id' },
		showParentOnProfile: { type: 'boolean' },
		showSubOnProfile: { type: 'boolean' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private subAccountService: SubAccountService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.subAccountService.updateDisplay(me, ps.subId, ps).catch(e => { throw toApiError(e); });
		});
	}
}
