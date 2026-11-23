/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { RegistrationTicketsRepository, MiMeta } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../error.js';
import { isSignupPassphraseMatch, timingSafeStringEqual } from '@/misc/normalize-signup-passphrase.js';

export const meta = {
	tags: ['invite'],

	requireCredential: false,

	limit: {
		duration: ms('1hour'),
		max: 3,
	},

	errors: {
		invalidCode: {
			message: 'Invalid invitation code.',
			code: 'INVALID_INVITE_CODE',
			id: '2dde42dd-eb9d-4335-8258-bdf707e1c82c',
		},
		expiredCode: {
			message: 'Invitation code has expired.',
			code: 'EXPIRED_INVITE_CODE',
			id: 'd4c1dba9-a90f-4f82-9d4f-cc00a502b00a',
		},
		codeAlreadyUsed: {
			message: 'Invitation code has already been used.',
			code: 'INVITE_CODE_ALREADY_USED',
			id: 'a5abbbbc-4952-4205-a412-33928e180c5b',
		},
	},

	res: {
		type: 'object',
		properties: {
			isValid: { type: 'boolean' },
			expiresAt: { type: 'string', format: 'date-time', nullable: true },
			skipEmailAuth: { type: 'boolean' },
			skipApproval: { type: 'boolean' },
		},
		required: ['isValid', 'skipEmailAuth', 'skipApproval'],
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		code: { type: 'string', minLength: 1 },
	},
	required: ['code'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.registrationTicketsRepository)
		private registrationTicketsRepository: RegistrationTicketsRepository,
	) {
		super(meta, paramDef, async (ps) => {
			const { code } = ps;

			// 固定招待コード・合言葉 (Meta 設定)。
			// 通常の招待コードと異なり消費されないため、常に有効扱い。
			// スキップ特権 (skipEmailAuth / skipApproval) は持たない。
			if (this.serverSettings.fixedInviteCode != null && timingSafeStringEqual(code, this.serverSettings.fixedInviteCode)) {
				return {
					isValid: true,
					expiresAt: null,
					skipEmailAuth: false,
					skipApproval: false,
				};
			}

			if (isSignupPassphraseMatch(code, this.serverSettings.signupPassphrase)) {
				return {
					isValid: true,
					expiresAt: null,
					skipEmailAuth: false,
					skipApproval: false,
				};
			}

			const ticket = await this.registrationTicketsRepository.findOneBy({
				code: code,
			});

			if (!ticket) {
				throw new ApiError(meta.errors.invalidCode);
			}

			if (ticket.usedById !== null) {
				throw new ApiError(meta.errors.codeAlreadyUsed);
			}

			if (ticket.expiresAt && ticket.expiresAt < new Date()) {
				throw new ApiError(meta.errors.expiredCode);
			}

			return {
				isValid: true,
				expiresAt: ticket.expiresAt ? ticket.expiresAt.toISOString() : null,
				skipEmailAuth: ticket.skipEmailAuth,
				skipApproval: ticket.skipApproval,
			};
		});
	}
}
