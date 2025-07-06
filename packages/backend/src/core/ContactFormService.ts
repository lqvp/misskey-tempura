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
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { MiUser } from '@/models/User.js';

@Injectable()
export class ContactFormService {
	constructor(
		@Inject(DI.contactFormsRepository)
		private contactFormsRepository: ContactFormsRepository,

		private systemWebhookService: SystemWebhookService,
		private moderationLogService: ModerationLogService,
		private userEntityService: UserEntityService,
	) {
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

		// モデレーションログに記録
		this.moderationLogService.log(null, 'contactFormReceived', {
			contactFormId: contactForm.id,
			subject: contactForm.subject,
			category: contactForm.category,
			replyMethod: contactForm.replyMethod,
		});
	}
}
