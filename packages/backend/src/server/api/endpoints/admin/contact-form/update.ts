/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { ContactFormsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ContactFormService } from '@/core/ContactFormService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:contact-form',
	secure: true,

	errors: {
		noSuchContactForm: {
			message: 'No such contact form.',
			code: 'NO_SUCH_CONTACT_FORM',
			id: 'bf326f31-d430-4f97-9933-5d61e4d48a23',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		contactFormId: { type: 'string', format: 'misskey:id' },
		status: { type: 'string', enum: ['pending', 'in_progress', 'resolved', 'closed'], nullable: true },
		adminNote: { type: 'string', nullable: true },
		assignedUserId: { type: 'string', format: 'misskey:id', nullable: true },
		assignedNickname: { type: 'string', nullable: true },
	},
	required: ['contactFormId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.contactFormsRepository)
		private contactFormsRepository: ContactFormsRepository,

		private contactFormService: ContactFormService,
	) {
		super(meta, paramDef, async (ps) => {
			// 存在確認
			const contactForm = await this.contactFormService.show(ps.contactFormId);
			if (!contactForm) {
				throw new ApiError(meta.errors.noSuchContactForm);
			}

			// 更新
			await this.contactFormService.update(ps.contactFormId, {
				status: ps.status ?? undefined,
				adminNote: ps.adminNote ?? undefined,
				assignedUserId: ps.assignedUserId !== undefined ? ps.assignedUserId : undefined,
				assignedNickname: ps.assignedNickname !== undefined ? ps.assignedNickname : undefined,
			});
		});
	}
}
