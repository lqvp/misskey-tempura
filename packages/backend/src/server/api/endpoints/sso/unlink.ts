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
		notLinked: {
			message: 'This user is not linked to this provider.',
			code: 'NOT_LINKED',
			id: 'bf4c9e3a-5d6f-4a7b-0c1d-2e3f4a5b6c7d',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			success: {
				type: 'boolean',
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
				await this.ssoService.unlinkAccount(me.id, ps.provider);
				return { success: true };
			} catch (err) {
				if (err instanceof SsoError) {
					throw new ApiError(meta.errors.notLinked);
				}
				throw err;
			}
		});
	}
}
