/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { ContactFormsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:contact-form',

	errors: {
		noSuchContactForm: {
			message: 'No such contact form.',
			code: 'NO_SUCH_CONTACT_FORM',
			id: 'f3g7h8c5-e6d4-4f0e-bf9f-1234567890fg',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		contactFormId: { type: 'string', format: 'misskey:id' },
	},
	required: ['contactFormId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.contactFormsRepository)
		private contactFormsRepository: ContactFormsRepository,

		private moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const contactForm = await this.contactFormsRepository.findOneBy({ id: ps.contactFormId });

			if (!contactForm) {
				throw new ApiError(meta.errors.noSuchContactForm);
			}

			await this.contactFormsRepository.delete(ps.contactFormId);

			// モデレーションログに記録
			this.moderationLogService.log(me, 'deleteContactForm', {
				contactFormId: contactForm.id,
			});
		});
	}
}
