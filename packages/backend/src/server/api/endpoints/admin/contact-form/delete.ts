/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { ContactsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { SystemWebhookService } from '@/core/SystemWebhookService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	secure: true,
	kind: 'write:admin:contact-form',

	errors: {
		noSuchContact: {
			message: 'No such contact.',
			code: 'NO_SUCH_CONTACT',
			id: '4362f8dc-731f-4ad8-a694-be2a88922a24',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		contactId: { type: 'string', format: 'misskey:id' },
	},
	required: ['contactId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.contactsRepository)
		private contactsRepository: ContactsRepository,

		private systemWebhookService: SystemWebhookService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const contact = await this.contactsRepository.findOneBy({
				id: ps.contactId,
			});

			if (contact == null) {
				throw new ApiError(meta.errors.noSuchContact);
			}

			// Store a copy of the contact for webhook
			const deletedContact = { ...contact };

			await this.contactsRepository.delete(contact.id);

			// Send webhook notification for contact deletion
			await this.systemWebhookService.enqueueSystemWebhook('contactDeleted', {
				contact: deletedContact,
			});
		});
	}
};
