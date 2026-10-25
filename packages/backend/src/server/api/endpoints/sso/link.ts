/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
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

	// 乗っ取られたセッションからのパスワード総当たり (再認証の突破) を抑える。i/update-email と同じ形式の上限
	limit: {
		duration: ms('1hour'),
		max: 10,
	},

	errors: {
		providerNotFound: {
			message: 'SSO provider is not configured or disabled.',
			code: 'PROVIDER_NOT_FOUND',
			id: '9f2a7c1e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
		},
		incorrectPassword: {
			message: 'Incorrect password.',
			code: 'INCORRECT_PASSWORD',
			id: '05a72dc0-b228-4d11-b2f0-e87251a43f74',
			httpStatusCode: 403,
		},
		authenticationFailed: {
			message: 'Two-factor authentication failed.',
			code: 'AUTHENTICATION_FAILED',
			id: '354ea019-fcea-47f0-82b1-35c0b87dcdd4',
			httpStatusCode: 403,
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

			// パスワード不一致のまま 2FA の確認 (バックアップコードの消費を含む) に進まないよう、パスワードを先に確認する
			const passwordMatched = profile.password != null && await bcrypt.compare(ps.password, profile.password);
			if (!passwordMatched) {
				throw new ApiError(meta.errors.incorrectPassword);
			}

			if (profile.twoFactorEnabled) {
				if (ps.token == null) {
					throw new ApiError(meta.errors.authenticationFailed);
				}

				try {
					await this.userAuthService.twoFactorAuthenticate(profile, ps.token);
				} catch (_) {
					throw new ApiError(meta.errors.authenticationFailed);
				}
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
