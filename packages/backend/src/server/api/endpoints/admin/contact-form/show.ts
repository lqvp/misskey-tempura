/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { ContactFormsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ContactFormEntityService } from '@/core/entities/ContactFormEntityService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:contact-form',

	res: {
		type: 'object',
		properties: {
			id: { type: 'string', format: 'misskey:id' },
			createdAt: { type: 'string', format: 'date-time' },
			updatedAt: { type: 'string', format: 'date-time', nullable: true },
			subject: { type: 'string' },
			content: { type: 'string' },
			name: { type: 'string', nullable: true },
			email: { type: 'string', nullable: true },
			misskeyUsername: { type: 'string', nullable: true },
			replyMethod: { type: 'string', enum: ['email', 'misskey'] },
			category: { type: 'string', enum: ['bug_report', 'feature_request', 'account_issue', 'technical_issue', 'content_issue', 'other'] },
			status: { type: 'string', enum: ['pending', 'in_progress', 'resolved', 'closed'] },
			adminNote: { type: 'string', nullable: true },
			ipAddress: { type: 'string', nullable: true },
			userAgent: { type: 'string', nullable: true },
			user: { type: 'object', nullable: true, ref: 'UserLite' },
			assignedUser: { type: 'object', nullable: true, ref: 'UserLite' },
		},
	},

	errors: {
		noSuchContactForm: {
			message: 'No such contact form.',
			code: 'NO_SUCH_CONTACT_FORM',
			id: 'd1e5f6a3-c4b2-4d8c-9e7f-1234567890de',
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

		private contactFormEntityService: ContactFormEntityService,
	) {
		super(meta, paramDef, async (ps) => {
			const contactForm = await this.contactFormsRepository.findOne({
				where: { id: ps.contactFormId },
				relations: ['user', 'assignedUser'],
			});

			if (!contactForm) {
				throw new ApiError(meta.errors.noSuchContactForm);
			}

			return await this.contactFormEntityService.pack(contactForm);
		});
	}
}
