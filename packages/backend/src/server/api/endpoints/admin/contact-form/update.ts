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
			id: 'e2f6g7b4-d5c3-4e9d-af8e-1234567890ef',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		contactFormId: { type: 'string', format: 'misskey:id' },
		status: {
			type: 'string',
			enum: ['pending', 'in_progress', 'resolved', 'closed'],
			nullable: true
		},
		adminNote: { type: 'string', maxLength: 10000, nullable: true },
		assignedUserId: { type: 'string', format: 'misskey:id', nullable: true },
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

			const updateData: Partial<typeof contactForm> = {
				updatedAt: new Date(),
			};

			// ステータス更新
			if (ps.status !== undefined) {
				const oldStatus = contactForm.status;
				updateData.status = ps.status;

				// モデレーションログに記録
				this.moderationLogService.log(me, 'updateContactFormStatus', {
					contactFormId: contactForm.id,
					before: oldStatus,
					after: ps.status,
				});
			}

			// 管理者メモ更新
			if (ps.adminNote !== undefined) {
				updateData.adminNote = ps.adminNote || null;
			}

			// 担当者更新
			if (ps.assignedUserId !== undefined) {
				updateData.assignedUserId = ps.assignedUserId || null;

				if (ps.assignedUserId) {
					// TODO: ユーザー名を取得してモデレーションログに記録
					this.moderationLogService.log(me, 'assignContactForm', {
						contactFormId: contactForm.id,
						assignedUserId: ps.assignedUserId,
						assignedUserUsername: 'TODO', // ユーザー名取得要実装
					});
				}
			}

			await this.contactFormsRepository.update(ps.contactFormId, updateData);
		});
	}
}
