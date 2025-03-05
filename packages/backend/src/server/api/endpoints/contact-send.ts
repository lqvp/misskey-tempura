/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import type { ContactsRepository } from '@/models/_.js';
import { MiContact } from '@/models/Contact.js';
import { SystemWebhookService } from '@/core/SystemWebhookService.js';
import { CaptchaService } from '@/core/CaptchaService.js';
import { ApiError } from '../error.js';

export const meta = {
	tags: ['meta'],

	requireCredential: false,

	limit: {
		duration: ms('1hour'),
		max: 1,
	},

	errors: {
		invalidEmailAddress: {
			message: 'Invalid email address.',
			code: 'INVALID_EMAIL_ADDRESS',
			id: '33d6d0a2-a216-4af8-a73c-8f2eba725335',
		},
		enableContactFormDisabled: {
			message: 'Contact form is disabled.',
			code: 'ENABLE_CONTACT_FORM_DISABLED',
			id: 'c7e0c3b1-3b8a-4d8c-9b8a-1c3b8a1c3b8a',
		},
		captchaFailed: {
			message: 'CAPTCHA verification failed.',
			code: 'CAPTCHA_FAILED',
			id: 'bd5cd137-e928-4d47-9d12-7e3a3fdae7ed',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		subject: { type: 'string' },
		message: { type: 'string' },
		name: { type: 'string' },
		email: { type: 'string', nullable: true },
		misskeyUser: { type: 'string' },
		category: { type: 'string' },
		'hcaptcha-response': { type: 'string', nullable: true },
		'g-recaptcha-response': { type: 'string', nullable: true },
		'turnstile-response': { type: 'string', nullable: true },
		'm-captcha-response': { type: 'string', nullable: true },
		'testcaptcha-response': { type: 'string', nullable: true },
	},
	required: ['subject', 'message', 'name', 'misskeyUser', 'category'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.contactsRepository)
		private contactsRepository: ContactsRepository,

		private idService: IdService,
		private systemWebhookService: SystemWebhookService,
		private captchaService: CaptchaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// Enable contact form if not enabled
			if (!this.serverSettings.enableContactForm) {
				throw new ApiError(meta.errors.enableContactFormDisabled);
			}

			// Verify CAPTCHA
			if (process.env.NODE_ENV === 'test') {
				// Skip verification in test environment
				// But still log the received captcha responses for debugging purposes
				console.info('Test environment - skipping CAPTCHA verification', {
					'hcaptcha-response': ps['hcaptcha-response'],
					'm-captcha-response': ps['m-captcha-response'],
					'g-recaptcha-response': ps['g-recaptcha-response'],
					'turnstile-response': ps['turnstile-response'],
					'testcaptcha-response': ps['testcaptcha-response'],
				});
			} else {
				try {
					if (this.serverSettings.enableHcaptcha && this.serverSettings.hcaptchaSecretKey) {
						await this.captchaService.verifyHcaptcha(this.serverSettings.hcaptchaSecretKey, ps['hcaptcha-response']);
					}

					if (this.serverSettings.enableMcaptcha && this.serverSettings.mcaptchaSecretKey && this.serverSettings.mcaptchaSitekey && this.serverSettings.mcaptchaInstanceUrl) {
						await this.captchaService.verifyMcaptcha(this.serverSettings.mcaptchaSecretKey, this.serverSettings.mcaptchaSitekey, this.serverSettings.mcaptchaInstanceUrl, ps['m-captcha-response']);
					}

					if (this.serverSettings.enableRecaptcha && this.serverSettings.recaptchaSecretKey) {
						await this.captchaService.verifyRecaptcha(this.serverSettings.recaptchaSecretKey, ps['g-recaptcha-response']);
					}

					if (this.serverSettings.enableTurnstile && this.serverSettings.turnstileSecretKey) {
						await this.captchaService.verifyTurnstile(this.serverSettings.turnstileSecretKey, ps['turnstile-response']);
					}

					if (this.serverSettings.enableTestcaptcha) {
						await this.captchaService.verifyTestcaptcha(ps['testcaptcha-response']);
					}
				} catch (err) {
					throw new ApiError(meta.errors.captchaFailed);
				}
			}

			// Email validation if provided and not empty
			if (ps.email != null && ps.email !== '') {
				const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
				if (!emailRegex.test(ps.email)) {
					throw new ApiError(meta.errors.invalidEmailAddress);
				}
			}

			// Create contact record
			const contact = await this.contactsRepository.insert({
				id: this.idService.gen(),
				subject: ps.subject,
				message: ps.message,
				name: ps.name,
				email: ps.email ?? null,
				misskeyUser: ps.misskeyUser ?? null,
				category: ps.category,
				status: 'pending',
				note: null,
				responseMessage: null,
				assigneeId: null,
				createdAt: new Date(),
				respondedAt: null,
			} as MiContact).then(x => this.contactsRepository.findOneByOrFail({ id: x.identifiers[0].id }));

			// Deliver webhook for contact form submissions
			await this.systemWebhookService.enqueueSystemWebhook('contactCreated', {
				contact: contact,
			});

			return {
				success: true,
			};
		});
	}
}
