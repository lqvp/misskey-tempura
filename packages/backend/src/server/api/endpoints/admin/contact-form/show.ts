/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { ContactsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { MiContact } from '@/models/Contact.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	secure: true,
	kind: 'read:admin:contact-form',

	errors: {
		noSuchContact: {
			message: 'No such contact.',
			code: 'NO_SUCH_CONTACT',
			id: '4362f8dc-731f-4ad8-a694-be2a88922a24',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			id: {
				type: 'string',
				optional: false, nullable: false,
				format: 'id',
				example: 'xxxxxxxxxx',
			},
			subject: {
				type: 'string',
				optional: false, nullable: false,
			},
			message: {
				type: 'string',
				optional: false, nullable: false,
			},
			name: {
				type: 'string',
				optional: false, nullable: false,
			},
			email: {
				type: 'string',
				optional: false, nullable: true,
			},
			misskeyUser: {
				type: 'string',
				optional: false, nullable: true,
				format: 'id',
			},
			category: {
				type: 'string',
				optional: false, nullable: false,
			},
			status: {
				type: 'string',
				enum: ['pending', 'inProgress', 'resolved'],
				optional: false, nullable: false,
			},
			note: {
				type: 'string',
				optional: false, nullable: true,
			},
			responseMessage: {
				type: 'string',
				optional: false, nullable: true,
			},
			assigneeId: {
				type: 'string',
				optional: false, nullable: true,
				format: 'id',
			},
			assignee: {
				type: 'object',
				optional: false, nullable: true,
				ref: 'User',
			},
			createdAt: {
				type: 'string',
				optional: false, nullable: false,
				format: 'date-time',
			},
			respondedAt: {
				type: 'string',
				optional: false, nullable: true,
				format: 'date-time',
			},
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

		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps) => {
			const contact = await this.contactsRepository.findOneBy({
				id: ps.contactId,
			});

			if (contact == null) {
				throw new ApiError(meta.errors.noSuchContact);
			}

			let assignee = null;
			if (contact.assigneeId) {
				assignee = await this.userEntityService.pack(contact.assigneeId, null, {
					schema: 'UserLite',
				});
			}

			return {
				id: contact.id,
				subject: contact.subject,
				message: contact.message,
				name: contact.name,
				email: contact.email,
				misskeyUser: contact.misskeyUser,
				category: contact.category,
				status: contact.status,
				note: contact.note,
				responseMessage: contact.responseMessage,
				assigneeId: contact.assigneeId,
				assignee,
				createdAt: contact.createdAt.toISOString(),
				respondedAt: contact.respondedAt ? contact.respondedAt.toISOString() : null,
			};
		});
	}
}
