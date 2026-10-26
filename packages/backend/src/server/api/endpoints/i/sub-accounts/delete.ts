/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { SubAccountService } from '@/core/SubAccountService.js';
import { DeleteAccountService } from '@/core/DeleteAccountService.js';
import { familyGuard } from '@/server/api/family-guard.js';
import { subAccountErrorMeta, toApiError } from '@/server/api/sub-account-errors.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,

	secure: true,
	familyGuard: familyGuard.subDenied,

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
		private deleteAccountService: DeleteAccountService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const sub = await this.subAccountService.getOwned(me, ps.subId).catch(e => { throw toApiError(e); });
			// the main account deletes its sub-accounts; a sub-account cannot delete itself
			await this.deleteAccountService.deleteAccount({ id: sub.id, host: sub.host });
		});
	}
}
