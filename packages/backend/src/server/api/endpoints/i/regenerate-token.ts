/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import bcrypt from 'bcryptjs';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsersRepository, UserProfilesRepository } from '@/models/_.js';
import { generateNativeUserToken } from '@/misc/token.js';
import { SubAccountService } from '@/core/SubAccountService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DI } from '@/di-symbols.js';
import { familyGuard } from '@/server/api/family-guard.js';

export const meta = {
	requireCredential: true,

	secure: true,

	// sub-accounts have no password, email, 2FA or independent credentials; refuse before the handler runs
	familyGuard: familyGuard.subDenied,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		password: { type: 'string' },
	},
	required: ['password'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private globalEventService: GlobalEventService,
		private subAccountService: SubAccountService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const freshUser = await this.usersRepository.findOneByOrFail({ id: me.id });
			const oldToken = freshUser.token!;

			const profile = await this.userProfilesRepository.findOneByOrFail({ userId: me.id });

			// Compare password
			const same = await bcrypt.compare(ps.password, profile.password!);

			if (!same) {
				throw new Error('incorrect password');
			}

			// A main account's sub-accounts are bound to its token: revoke them first,
			// so a failure leaves the main token unchanged and the call can be retried.
			await this.subAccountService.invalidateSubAccountTokens(me.id);

			const newToken = generateNativeUserToken();

			await this.usersRepository.update(me.id, {
				token: newToken,
			});

			// Publish event
			this.globalEventService.publishInternalEvent('userTokenRegenerated', { id: me.id, oldToken, newToken });
			this.globalEventService.publishMainStream(me.id, 'myTokenRegenerated');
		});
	}
}
