/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { SsoService, SsoError } from '../../SsoService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,

	secure: true,

	errors: {
		providerNotFound: {
			message: 'SSO provider is not configured or disabled.',
			code: 'PROVIDER_NOT_FOUND',
			id: '9f2a7c1e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			authorizationUrl: {
				type: 'string',
				optional: false, nullable: false,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		provider: { type: 'string', minLength: 1, maxLength: 128 },
	},
	required: ['provider'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private ssoService: SsoService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const authorizationUrl = await this.ssoService.linkAccount(me.id, ps.provider);
				return { authorizationUrl };
			} catch (err) {
				if (err instanceof SsoError) {
					throw new ApiError(meta.errors.providerNotFound);
				}
				throw err;
			}
		});
	}
}
