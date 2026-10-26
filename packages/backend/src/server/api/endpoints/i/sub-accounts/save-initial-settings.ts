/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { SubAccountService } from '@/core/SubAccountService.js';
import { familyGuard } from '@/server/api/family-guard.js';
import { subAccountErrorMeta, toApiError } from '@/server/api/sub-account-errors.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,

	secure: true,
	familyGuard: familyGuard.subDenied,

	limit: {
		duration: ms('1hour'),
		max: 30,
	},

	errors: subAccountErrorMeta,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			saved: { type: 'number', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		subId: { type: 'string', format: 'misskey:id' },
		items: {
			type: 'array',
			maxItems: 400,
			items: {
				type: 'object',
				properties: {
					scope: { type: 'array', items: { type: 'string', pattern: /^[a-zA-Z0-9_]+$/.toString().slice(1, -1) } },
					key: { type: 'string', minLength: 1, maxLength: 1024 },
					value: {},
				},
				required: ['scope', 'key', 'value'],
			},
		},
	},
	required: ['subId', 'items'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private subAccountService: SubAccountService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const saved = await this.subAccountService.saveInitialSettings(me, ps.subId, ps.items).catch(e => { throw toApiError(e); });
			return { saved };
		});
	}
}
