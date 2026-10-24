/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { SsoService } from '../../SsoService.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,
	kind: 'read:account',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			links: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						provider: {
							type: 'string',
							optional: false, nullable: false,
						},
						providerUserId: {
							type: 'string',
							optional: false, nullable: false,
						},
						createdAt: {
							type: 'string',
							optional: false, nullable: false,
							format: 'date-time',
						},
					},
				},
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
		private ssoService: SsoService,
	) {
		super(meta, paramDef, async (ps, me) => {
			return await this.ssoService.getStatus(me.id);
		});
	}
}
