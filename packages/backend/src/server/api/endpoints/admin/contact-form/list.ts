/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { ContactFormsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { ContactFormEntityService } from '@/core/entities/ContactFormEntityService.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:contact-form',

	res: {
		type: 'array',
		items: {
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
				user: { type: 'object', nullable: true, ref: 'UserLite' },
				assignedUser: { type: 'object', nullable: true, ref: 'UserLite' },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
		status: { type: 'string', enum: ['pending', 'in_progress', 'resolved', 'closed'], nullable: true },
		category: { type: 'string', enum: ['bug_report', 'feature_request', 'account_issue', 'technical_issue', 'content_issue', 'other'], nullable: true },
		assignedUserId: { type: 'string', format: 'misskey:id', nullable: true },
	},
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.contactFormsRepository)
		private contactFormsRepository: ContactFormsRepository,

		private queryService: QueryService,
		private contactFormEntityService: ContactFormEntityService,
	) {
		super(meta, paramDef, async (ps) => {
			const query = this.queryService.makePaginationQuery(
				this.contactFormsRepository.createQueryBuilder('contactForm'),
				ps.offset,
				ps.limit,
			)
				.leftJoinAndSelect('contactForm.user', 'user')
				.leftJoinAndSelect('contactForm.assignedUser', 'assignedUser')
				.orderBy('contactForm.createdAt', 'DESC');

			if (ps.status) {
				query.andWhere('contactForm.status = :status', { status: ps.status });
			}

			if (ps.category) {
				query.andWhere('contactForm.category = :category', { category: ps.category });
			}

			if (ps.assignedUserId) {
				query.andWhere('contactForm.assignedUserId = :assignedUserId', { assignedUserId: ps.assignedUserId });
			}

			const contactForms = await query.getMany();

			return await this.contactFormEntityService.packMany(contactForms);
		});
	}
}
