/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { ContactsRepository, UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { IdService } from '@/core/IdService.js';
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
		noSuchAssignee: {
			message: 'No such assignee.',
			code: 'NO_SUCH_ASSIGNEE',
			id: '82d97696-8be1-4a31-b5c9-12264a75da4d',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		contactId: { type: 'string', format: 'misskey:id' },
		status: { type: 'string', enum: ['pending', 'inProgress', 'resolved'], nullable: true },
		note: { type: 'string', nullable: true },
		responseMessage: { type: 'string', nullable: true },
		assigneeId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: ['contactId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.contactsRepository)
		private contactsRepository: ContactsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private idService: IdService,
		private systemWebhookService: SystemWebhookService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const contact = await this.contactsRepository.findOneBy({
				id: ps.contactId,
			});

			if (contact == null) {
				throw new ApiError(meta.errors.noSuchContact);
			}

			// Check if assignee exists if provided
			if (ps.assigneeId != null) {
				const user = await this.usersRepository.findOneBy({
					id: ps.assigneeId,
				});

				if (user == null) {
					throw new ApiError(meta.errors.noSuchAssignee);
				}
			}

			const previousStatus = contact.status;
			const updateData: Record<string, any> = {};

			// Only add properties that are actually provided
			if (ps.status !== undefined) {
				updateData.status = ps.status;
			}

			if (ps.note !== undefined) {
				updateData.note = ps.note;
			}

			if (ps.responseMessage !== undefined) {
				updateData.responseMessage = ps.responseMessage;
			}

			if (ps.assigneeId !== undefined) {
				updateData.assigneeId = ps.assigneeId;
			}

			// Add respondedAt if needed
			if (ps.status === 'resolved' && previousStatus !== 'resolved') {
				updateData.respondedAt = new Date();
			}

			await this.contactsRepository.update(contact.id, updateData);

			// Get updated contact
			const updatedContact = await this.contactsRepository.findOneByOrFail({
				id: contact.id,
			});

			// If the status has changed to resolved, trigger a webhook
			if (ps.status === 'resolved' && previousStatus !== 'resolved') {
				await this.systemWebhookService.enqueueSystemWebhook('contactResolved', {
					contact: updatedContact,
				});
			} else {
				// For other updates, send contactUpdated event
				await this.systemWebhookService.enqueueSystemWebhook('contactUpdated', {
					contact: updatedContact,
				});
			}
		});
	}
}
