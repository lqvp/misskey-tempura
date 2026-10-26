/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { SubAccountService } from '@/core/SubAccountService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { familyGuard } from '@/server/api/family-guard.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,

	secure: true,
	familyGuard: familyGuard.subDenied,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				user: { type: 'object', optional: false, nullable: false, ref: 'UserLite' },
				approved: { type: 'boolean', optional: false, nullable: false },
				isSuspended: { type: 'boolean', optional: false, nullable: false },
				suspendedSelf: { type: 'boolean', optional: false, nullable: false },
				suspendedByParent: { type: 'boolean', optional: false, nullable: false },
				showParentOnProfile: { type: 'boolean', optional: false, nullable: false },
				showSubOnProfile: { type: 'boolean', optional: false, nullable: false },
			},
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
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const subs = await this.subAccountService.list(me);
			const packed = await this.userEntityService.packMany(subs, me, { schema: 'UserLite' });
			return subs.map((s, i) => ({
				user: packed[i],
				approved: s.approved,
				isSuspended: s.isSuspended,
				suspendedSelf: s.suspendedSelf,
				suspendedByParent: s.suspendedByParent,
				showParentOnProfile: s.showParentOnProfile,
				showSubOnProfile: s.showSubOnProfile,
			}));
		});
	}
}
