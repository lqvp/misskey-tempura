/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { ContactFormsRepository } from '@/models/_.js';
import type { MiContactForm } from '@/models/ContactForm.js';
import { bindThis } from '@/decorators.js';
import { SystemWebhookService, ContactFormPayload } from '@/core/SystemWebhookService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { MiUser } from '@/models/User.js';

export type ContactFormListOptions = {
	limit: number;
	offset: number;
	status?: 'pending' | 'in_progress' | 'resolved' | 'closed';
	category?: 'bug_report' | 'feature_request' | 'account_issue' | 'technical_issue' | 'content_issue' | 'other';
	assignedUserId?: string;
};

export type ContactFormUpdateData = {
	status?: 'pending' | 'in_progress' | 'resolved' | 'closed';
	adminNote?: string;
	assignedUserId?: string | null;
};

@Injectable()
export class ContactFormService {
	constructor(
		@Inject(DI.contactFormsRepository)
		private contactFormsRepository: ContactFormsRepository,

		private systemWebhookService: SystemWebhookService,
		private userEntityService: UserEntityService,
	) {
	}

	@bindThis
	public async list(options: ContactFormListOptions): Promise<MiContactForm[]> {
		const query = this.contactFormsRepository.createQueryBuilder('contactForm')
			.leftJoinAndSelect('contactForm.user', 'user')
			.leftJoinAndSelect('contactForm.assignedUser', 'assignedUser')
			.orderBy('contactForm.createdAt', 'DESC');

		if (options.status) {
			query.andWhere('contactForm.status = :status', { status: options.status });
		}

		if (options.category) {
			query.andWhere('contactForm.category = :category', { category: options.category });
		}

		if (options.assignedUserId) {
			query.andWhere('contactForm.assignedUserId = :assignedUserId', { assignedUserId: options.assignedUserId });
		}

		query.limit(options.limit);
		query.offset(options.offset);

		return query.getMany();
	}

	@bindThis
	public async show(contactFormId: string): Promise<MiContactForm | null> {
		return this.contactFormsRepository.findOne({
			where: { id: contactFormId },
			relations: ['user', 'assignedUser'],
		});
	}

	@bindThis
	public async update(contactFormId: string, data: ContactFormUpdateData): Promise<void> {
		const updateData: Partial<MiContactForm> = {};

		if (data.status !== undefined) {
			updateData.status = data.status;
		}

		if (data.adminNote !== undefined) {
			updateData.adminNote = data.adminNote;
		}

		if (data.assignedUserId !== undefined) {
			updateData.assignedUserId = data.assignedUserId;
		}

		updateData.updatedAt = new Date();

		await this.contactFormsRepository.update(contactFormId, updateData);
	}

	@bindThis
	public async delete(contactFormId: string): Promise<void> {
		await this.contactFormsRepository.delete(contactFormId);
	}

	@bindThis
	public async notifyContactFormReceived(contactForm: MiContactForm): Promise<void> {
		// Webhook通知用のペイロードを作成
		const payload: ContactFormPayload = {
			id: contactForm.id,
			subject: contactForm.subject,
			content: contactForm.content,
			name: contactForm.name,
			email: contactForm.email,
			misskeyUsername: contactForm.misskeyUsername,
			replyMethod: contactForm.replyMethod,
			category: contactForm.category,
			status: contactForm.status,
			ipAddress: contactForm.ipAddress,
			user: contactForm.user ? await this.userEntityService.pack(contactForm.user, undefined, { schema: 'UserLite' }) : null,
		};

		// System Webhookに通知
		await this.systemWebhookService.enqueueSystemWebhook('contactForm', payload);
	}
}
