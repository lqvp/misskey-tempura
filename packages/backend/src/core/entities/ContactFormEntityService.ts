/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { ContactFormsRepository } from '@/models/_.js';
import type { MiContactForm } from '@/models/ContactForm.js';
import { bindThis } from '@/decorators.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { Packed } from '@/misc/json-schema.js';

@Injectable()
export class ContactFormEntityService {
	constructor(
		@Inject(DI.contactFormsRepository)
		private contactFormsRepository: ContactFormsRepository,

		private userEntityService: UserEntityService,
	) {
	}

	@bindThis
	public async pack(
		src: MiContactForm['id'] | MiContactForm,
	): Promise<Packed<'ContactForm'>> {
		const contactForm = typeof src === 'object' ? src : await this.contactFormsRepository.findOneByOrFail({ id: src });

		return {
			id: contactForm.id,
			createdAt: contactForm.createdAt.toISOString(),
			updatedAt: contactForm.updatedAt?.toISOString() ?? null,
			subject: contactForm.subject,
			content: contactForm.content,
			name: contactForm.name,
			email: contactForm.email,
			misskeyUsername: contactForm.misskeyUsername,
			replyMethod: contactForm.replyMethod,
			category: contactForm.category,
			status: contactForm.status,
			adminNote: contactForm.adminNote,
			ipAddress: contactForm.ipAddress,
			userAgent: contactForm.userAgent,
			user: contactForm.user ? await this.userEntityService.pack(contactForm.user, undefined, { schema: 'UserLite' }) : null,
			assignedUser: contactForm.assignedUser ? await this.userEntityService.pack(contactForm.assignedUser, undefined, { schema: 'UserLite' }) : null,
		};
	}

	@bindThis
	public async packMany(
		contactForms: MiContactForm[],
	): Promise<Packed<'ContactForm'>[]> {
		return Promise.all(contactForms.map(contactForm => this.pack(contactForm)));
	}
}
