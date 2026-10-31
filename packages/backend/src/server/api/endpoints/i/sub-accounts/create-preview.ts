/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { SubAccountService } from '@/core/SubAccountService.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,

	// sub-account management is for main accounts, with the native token only
	secure: true,
	denyForSubAccount: true,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			canCreate: { type: 'boolean', optional: false, nullable: false },
			reason: { type: 'string', optional: false, nullable: true },
			limit: { type: 'integer', optional: false, nullable: false },
			used: { type: 'integer', optional: false, nullable: false },
			remaining: { type: 'integer', optional: false, nullable: false },
			requiresApproval: { type: 'boolean', optional: false, nullable: false },
			mode: { type: 'string', optional: false, nullable: false, enum: ['followRegistration', 'independent'] },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private subAccountService: SubAccountService,
	) {
		super(meta, paramDef, async (ps, me) => {
			return await this.subAccountService.getCreationStatus(me);
		});
	}
}
