/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { ContactsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	secure: true,
	kind: 'read:admin:contact-form',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: {
					type: 'string',
					optional: false, nullable: false,
					format: 'id',
					example: 'xxxxxxxxxx',
				},
				email: {
					type: 'string',
					optional: false, nullable: true,
				},
				created: {
					type: 'string',
					optional: false, nullable: false,
					format: 'date-time',
				},
				updated: {
					type: 'string',
					optional: false, nullable: false,
					format: 'date-time',
				},
				misskeyUser: {
					type: 'string',
					optional: false, nullable: true,
					format: 'id',
				},
				message: {
					type: 'string',
					optional: false, nullable: false,
				},
				files: {
					type: 'array',
					optional: false, nullable: false,
					items: {
						type: 'string',
						optional: false, nullable: false,
					},
				},
				category: {
					type: 'string',
					optional: false, nullable: false,
				},
				forwarded: {
					type: 'boolean',
					optional: false, nullable: false,
				},
				responseMessage: {
					type: 'string',
					optional: false, nullable: true,
				},
				note: {
					type: 'string',
					optional: false, nullable: true,
				},
				status: {
					type: 'string',
					enum: ['pending', 'inProgress', 'resolved'],
					optional: false, nullable: false,
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
				respondedAt: {
					type: 'string',
					optional: false, nullable: true,
					format: 'date-time',
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		status: { type: 'string', enum: ['pending', 'inProgress', 'resolved'] },
		origin: { type: 'string', enum: ['internal', 'external'] },
		category: { type: 'string' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.contactsRepository)
		private contactsRepository: ContactsRepository,

		private queryService: QueryService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.queryService.makePaginationQuery(this.contactsRepository.createQueryBuilder('contact'), ps.sinceId, ps.untilId);

			if (ps.status) {
				query.andWhere('contact.status = :status', { status: ps.status });
			}

			if (ps.origin === 'internal') {
				query.andWhere('contact.misskeyUser IS NOT NULL');
			} else if (ps.origin === 'external') {
				query.andWhere('contact.misskeyUser IS NULL');
			}

			if (ps.category) {
				query.andWhere('contact.category = :category', { category: ps.category });
			}

			const contacts = await query
				.orderBy('contact.id', 'DESC')
				.limit(ps.limit)
				.getMany();

			return await Promise.all(contacts.map(async contact => {
				let assignee = null;
				if (contact.assigneeId) {
					assignee = await this.userEntityService.pack(contact.assigneeId, null, {
						schema: 'UserLite',
					});
				}

				return {
					id: contact.id,
					email: contact.email,
					created: contact.createdAt.toISOString(),
					updated: contact.createdAt.toISOString(), // Using createdAt as there's no updated field
					misskeyUser: contact.misskeyUser,
					message: contact.message,
					files: [], // Placeholder as this doesn't appear to be in the model
					category: contact.category,
					forwarded: false, // Placeholder as this doesn't appear to be in the model
					responseMessage: contact.responseMessage,
					note: contact.note,
					status: contact.status,
					assigneeId: contact.assigneeId,
					assignee,
					respondedAt: contact.respondedAt ? contact.respondedAt.toISOString() : null,
				};
			}));
		});
	}
}
