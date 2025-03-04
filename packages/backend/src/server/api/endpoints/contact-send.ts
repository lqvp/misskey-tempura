/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import type { ContactsRepository } from '@/models/_.js';
import { MiContact } from '@/models/Contact.js';
import { SystemWebhookService } from '@/core/SystemWebhookService.js';
import { systemWebhookEventTypes } from '@/models/SystemWebhook.js';
import { ApiError } from '../error.js';

export const meta = {
	tags: ['meta'],

	requireCredential: false,

	limit: {
		duration: ms('1hour'),
		max: 1,
	},

	errors: {
		invalidEmailAddress: {
			message: 'Invalid email address.',
			code: 'INVALID_EMAIL_ADDRESS',
			id: '33d6d0a2-a216-4af8-a73c-8f2eba725335',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		subject: { type: 'string' },
		message: { type: 'string' },
		name: { type: 'string' },
		email: { type: 'string', nullable: true },
		misskeyUser: { type: 'string', nullable: true },
		category: { type: 'string' },
	},
	required: ['subject', 'message', 'name', 'category'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.contactsRepository)
		private contactsRepository: ContactsRepository,

		private idService: IdService,
		private systemWebhookService: SystemWebhookService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// Email validation if provided
			if (ps.email != null) {
				const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
				if (!emailRegex.test(ps.email)) {
					throw new ApiError(meta.errors.invalidEmailAddress);
				}
			}

			// Create contact record
			const contact = await this.contactsRepository.insert({
				id: this.idService.gen(),
				subject: ps.subject,
				message: ps.message,
				name: ps.name,
				email: ps.email ?? null,
				misskeyUser: ps.misskeyUser ?? null,
				category: ps.category,
				status: 'pending',
				note: null,
				responseMessage: null,
				assigneeId: null,
				createdAt: new Date(),
				respondedAt: null,
			} as MiContact).then(x => this.contactsRepository.findOneByOrFail({ id: x.identifiers[0].id }));

			// Deliver webhook for contact form submissions
			await this.systemWebhookService.enqueueSystemWebhook('contactCreated', {
				contact: contact,
			});

			return {
				success: true,
			};
		});
	}
}
