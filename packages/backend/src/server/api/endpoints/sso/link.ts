/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import bcrypt from 'bcryptjs';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UserProfilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { UserAuthService } from '@/core/UserAuthService.js';
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
			binding: {
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
		// 乗っ取られたセッションから攻撃者の外部アカウントを連携されないよう、再認証を要求する
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

			if (profile.twoFactorEnabled) {
				if (ps.token == null) {
					throw new Error('authentication failed');
				}

				try {
					await this.userAuthService.twoFactorAuthenticate(profile, ps.token);
				} catch (_) {
					throw new Error('authentication failed');
				}
			}

			const passwordMatched = profile.password != null && await bcrypt.compare(ps.password, profile.password);
			if (!passwordMatched) {
				throw new Error('incorrect password');
			}

			try {
				return await this.ssoService.linkAccount(me.id, ps.provider);
			} catch (err) {
				if (err instanceof SsoError) {
					throw new ApiError(meta.errors.providerNotFound);
				}
				throw err;
			}
		});
	}
}
