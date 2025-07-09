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
import { IdService } from '@/core/IdService.js';
import { MetaService } from '@/core/MetaService.js';
import type { ContactFormCategory } from '@/models/Meta.js';

export type ContactFormListOptions = {
	limit: number;
	offset: number;
	status?: 'pending' | 'in_progress' | 'resolved' | 'closed';
	category?: string;
	assignedUserId?: string;
};

export type ContactFormUpdateData = {
	status?: 'pending' | 'in_progress' | 'resolved' | 'closed';
	adminNote?: string;
	assignedUserId?: string | null;
	assignedNickname?: string | null;
};

export type ContactFormSubmitData = {
	subject: string;
	content: string;
	replyMethod: 'email' | 'misskey';
	name?: string | null;
	email?: string | null;
	misskeyUsername?: string | null;
	category?: string;
	ipAddress?: string | null;
	userAgent?: string | null;
	userId?: string | null;
};

@Injectable()
export class ContactFormService {
	constructor(
		@Inject(DI.contactFormsRepository)
		private contactFormsRepository: ContactFormsRepository,

		private systemWebhookService: SystemWebhookService,
		private userEntityService: UserEntityService,
		private idService: IdService,
		private metaService: MetaService,
	) {
	}

	@bindThis
	public async getEnabledCategories(): Promise<ContactFormCategory[]> {
		const meta = await this.metaService.fetch();
		return meta.contactFormCategories
			.filter(cat => cat.enabled)
			.sort((a, b) => a.order - b.order);
	}

	@bindThis
	public async getDefaultCategory(): Promise<string> {
		const categories = await this.getEnabledCategories();
		const defaultCategory = categories.find(cat => cat.isDefault);
		return defaultCategory ? defaultCategory.key : 'other';
	}

	@bindThis
	public async validateCategory(category: string): Promise<boolean> {
		const enabledCategories = await this.getEnabledCategories();
		return enabledCategories.some(cat => cat.key === category);
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

		if (data.assignedNickname !== undefined) {
			updateData.assignedNickname = data.assignedNickname;
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
			userAgent: contactForm.userAgent,
			user: contactForm.user ? await this.userEntityService.pack(contactForm.user, undefined, { schema: 'UserLite' }) : null,
		};

		// System Webhookに通知
		await this.systemWebhookService.enqueueSystemWebhook('receivedContactForm', payload);
	}

	@bindThis
	public async submit(data: ContactFormSubmitData): Promise<MiContactForm> {
		// カテゴリのバリデーション
		const category = data.category || await this.getDefaultCategory();
		if (!(await this.validateCategory(category))) {
			throw new Error('Invalid category');
		}

		const contactForm = await this.contactFormsRepository.insertOne({
			id: this.idService.gen(),
			createdAt: new Date(),
			subject: data.subject.trim(),
			content: data.content.trim(),
			replyMethod: data.replyMethod,
			name: data.name?.trim() || null,
			email: data.email?.trim() || null,
			misskeyUsername: data.misskeyUsername?.trim() || null,
			category: category,
			status: 'pending',
			ipAddress: data.ipAddress,
			userAgent: data.userAgent,
			userId: data.userId ?? null,
		});

		// Webhook通知とモデレーションログ記録
		await this.notifyContactFormReceived(contactForm);

		return contactForm;
	}
}
