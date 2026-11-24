/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import bcrypt from 'bcryptjs';
import { Inject, Injectable } from '@nestjs/common';
import type { UserProfilesRepository, PasswordResetRequestsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { ApiError } from '../error.js';

export const meta = {
	tags: ['reset password'],

	requireCredential: false,

	description: 'Complete the password reset that was previously requested.',

	limit: {
		duration: ms('1hour'),
		max: 10,
	},

	errors: {
		noSuchToken: {
			message: 'No such token.',
			code: 'NO_SUCH_TOKEN',
			id: 'a8d9e3f1-2b4c-5d6e-7f8a-9b0c1d2e3f4a',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		token: { type: 'string' },
		password: { type: 'string' },
	},
	required: ['token', 'password'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.passwordResetRequestsRepository)
		private passwordResetRequestsRepository: PasswordResetRequestsRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const req = await this.passwordResetRequestsRepository.findOneBy({
				token: ps.token,
			});

			if (req == null) {
				throw new ApiError(meta.errors.noSuchToken);
			}

			// 発行してから30分以上経過していたら無効
			if (Date.now() - this.idService.parse(req.id).date.getTime() > 1000 * 60 * 30) {
				throw new ApiError(meta.errors.noSuchToken);
			}

			// Generate hash of password
			const salt = await bcrypt.genSalt(10);
			const hash = await bcrypt.hash(ps.password, salt);

			await this.userProfilesRepository.update(req.userId, {
				password: hash,
			});

			await this.passwordResetRequestsRepository.delete(req.id);
		});
	}
}
