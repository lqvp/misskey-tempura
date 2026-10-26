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
		max: 60,
	},

	errors: subAccountErrorMeta,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			usable: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						type: { type: 'string', optional: false, nullable: false, enum: ['list', 'antenna', 'channel', 'clip', 'driveFolder'] },
						id: { type: 'string', optional: false, nullable: false },
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		subId: { type: 'string', format: 'misskey:id' },
		references: {
			type: 'array',
			maxItems: 500,
			items: {
				type: 'object',
				properties: {
					type: { type: 'string', enum: ['list', 'antenna', 'channel', 'clip', 'driveFolder'] },
					id: { type: 'string', format: 'misskey:id' },
				},
				required: ['type', 'id'],
			},
		},
	},
	required: ['subId', 'references'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private subAccountService: SubAccountService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const usable = await this.subAccountService.probeReferences(me, ps.subId, ps.references).catch(e => { throw toApiError(e); });
			return { usable };
		});
	}
}
