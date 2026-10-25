/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UserProfilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { UserAuthService } from '@/core/UserAuthService.js';
import { SsoService, SsoError } from '../../SsoService.js';
import { ApiError } from '../../error.js';
import { checkSsoReauth } from '../../sso-reauth.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,

	secure: true,

	// 乗っ取られたセッションからのパスワード総当たり (再認証の突破) を抑える。sso/link と同じ上限
	limit: {
		duration: ms('1hour'),
		max: 10,
	},

	errors: {
		notLinked: {
			message: 'This user is not linked to this provider.',
			code: 'NOT_LINKED',
			id: 'bf4c9e3a-5d6f-4a7b-0c1d-2e3f4a5b6c7d',
		},
		incorrectPassword: {
			message: 'Incorrect password.',
			code: 'INCORRECT_PASSWORD',
			id: '1c7a4e0d-6b2f-4f55-9d3e-8a1b5c7e2f90',
			httpStatusCode: 403,
		},
		authenticationFailed: {
			message: 'Two-factor authentication failed.',
			code: 'AUTHENTICATION_FAILED',
			id: '5e2d9b61-3a7c-4c18-b0f4-d6a8e1c93b27',
			httpStatusCode: 403,
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
		// 乗っ取られたセッションから SSO のログイン手段を外されないよう、連携のときと同じ再認証を要求する
		password: { type: 'string' },
		token: { type: 'string', nullable: true },
	},
	required: ['provider', 'password'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private userAuthService: UserAuthService,
		private ssoService: SsoService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const profile = await this.userProfilesRepository.findOneByOrFail({ userId: me.id });

			const reauth = await checkSsoReauth({ userAuthService: this.userAuthService }, profile, ps);
			if (reauth === 'password') throw new ApiError(meta.errors.incorrectPassword);
			if (reauth === 'twoFactor') throw new ApiError(meta.errors.authenticationFailed);

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
