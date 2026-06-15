/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { OidcService } from '../../OidcService.js';

export const meta = {
	tags: ['oidc'],

	requireCredential: true,
	kind: 'read:account',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			linked: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			providerUserId: {
				type: 'string',
				optional: true, nullable: true,
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
		private oidcService: OidcService,
	) {
		super(meta, paramDef, async (ps, me) => {
			return this.oidcService.getStatus(me.id);
		});
	}
}
