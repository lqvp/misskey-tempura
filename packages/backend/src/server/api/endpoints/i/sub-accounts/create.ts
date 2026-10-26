/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { SubAccountService } from '@/core/SubAccountService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { familyGuard } from '@/server/api/family-guard.js';
import { subAccountErrorMeta, toApiError } from '@/server/api/sub-account-errors.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,

	secure: true,
	familyGuard: familyGuard.subDenied,

	limit: {
		duration: ms('1hour'),
		max: 10,
	},

	errors: subAccountErrorMeta,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			subAccount: { type: 'object', optional: false, nullable: false, ref: 'UserLite' },
			requiresApproval: { type: 'boolean', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		username: { type: 'string' },
		confirmPending: { type: 'boolean', default: false },
	},
	required: ['username'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private subAccountService: SubAccountService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const { account, requiresApproval } = await this.subAccountService.create(me, ps.username, ps.confirmPending);
				return {
					subAccount: await this.userEntityService.pack(account, me, { schema: 'UserLite' }),
					requiresApproval,
				};
			} catch (e) {
				throw toApiError(e);
			}
		});
	}
}
