/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { IdService } from '@/core/IdService.js';
import type { ContactFormsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { MetaService } from '@/core/MetaService.js';
import { ApiError } from '@/server/api/error.js';
import { bindThis } from '@/decorators.js';
import { ContactFormService } from '@/core/ContactFormService.js';

export const meta = {
	tags: ['contact'],
	requireCredential: false,
	kind: 'write:contact',

	limit: {
		duration: 60 * 60 * 1000, // 1時間
		max: 3, // Meta設定から動的に読み込み
	},

	requireCaptcha: true,

	res: {
		type: 'object',
		properties: {
			id: { type: 'string', format: 'misskey:id' },
			message: { type: 'string' },
		},
	},

	errors: {
		contactFormDisabled: {
			message: 'Contact form is disabled.',
			code: 'CONTACT_FORM_DISABLED',
			id: 'a4c2c5a0-b7c0-4b1c-9c8d-1234567890ab',
		},
		invalidReplyMethod: {
			message: 'Invalid reply method or missing required field.',
			code: 'INVALID_REPLY_METHOD',
			id: 'b4c3c6a1-b8c1-4c2d-9d9e-1234567890bc',
		},
		authRequired: {
			message: 'Authentication required.',
			code: 'AUTH_REQUIRED',
			id: 'c5d4d7b2-c9d2-4d3e-9eaf-1234567890cd',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		// 必須項目
		subject: { type: 'string', minLength: 1, maxLength: 256 },
		content: { type: 'string', minLength: 10, maxLength: 10000 },
		replyMethod: { type: 'string', enum: ['email', 'misskey'] },

		// 条件付き必須項目
		email: {
			type: 'string',
			format: 'email',
			maxLength: 512,
			nullable: true,
		},
		misskeyUsername: {
			type: 'string',
			maxLength: 128,
			nullable: true,
		},

		// 任意項目
		name: { type: 'string', maxLength: 256, nullable: true },
		category: {
			type: 'string',
			enum: ['bug_report', 'feature_request', 'account_issue', 'technical_issue', 'content_issue', 'other'],
			default: 'other',
		},

		// CAPTCHA関連
		'hcaptcha-response': { type: 'string', nullable: true },
		'g-recaptcha-response': { type: 'string', nullable: true },
		'cf-turnstile-response': { type: 'string', nullable: true },
		'm-captcha-response': { type: 'string', nullable: true },
		'testcaptcha-response': { type: 'string', nullable: true },
	},
	required: ['subject', 'content', 'replyMethod'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.contactFormsRepository)
		private contactFormsRepository: ContactFormsRepository,

		private idService: IdService,
		private metaService: MetaService,
		private contactFormService: ContactFormService,
	) {
		super(meta, paramDef, async (ps, me, accessToken, file, ip, headers) => {
			const instance = await this.metaService.fetch();

			// コンタクトフォームが無効な場合
			if (!instance.enableContactForm) {
				throw new ApiError(meta.errors.contactFormDisabled);
			}

			// 認証が必要な場合
			if (instance.contactFormRequireAuth && !me) {
				throw new ApiError(meta.errors.authRequired);
			}

			// バリデーション: replyMethodに応じた必須フィールドチェック
			if (ps.replyMethod === 'email') {
				if (!ps.email || ps.email.trim() === '') {
					throw new ApiError(meta.errors.invalidReplyMethod);
				}
			} else if (ps.replyMethod === 'misskey') {
				if (!ps.misskeyUsername || ps.misskeyUsername.trim() === '') {
					throw new ApiError(meta.errors.invalidReplyMethod);
				}
			}

			// IPアドレスとUser-Agentの取得
			const ipAddress = ip || null;
			const userAgent = (headers && typeof headers === 'object' && 'user-agent' in headers)
				? String(headers['user-agent'] || '')
				: null;

			// コンタクトフォーム作成
			const contactForm = await this.contactFormsRepository.insertOne({
				id: this.idService.gen(),
				createdAt: new Date(),
				subject: ps.subject.trim(),
				content: ps.content.trim(),
				replyMethod: ps.replyMethod,
				name: ps.name?.trim() || null,
				email: ps.replyMethod === 'email' ? ps.email!.trim() : null,
				misskeyUsername: ps.replyMethod === 'misskey' ? ps.misskeyUsername!.trim() : null,
				category: ps.category ?? 'other',
				status: 'pending',
				ipAddress,
				userAgent,
				userId: me?.id ?? null,
			});

			// Webhook通知とモデレーションログ記録
			await this.contactFormService.notifyContactFormReceived(contactForm);

			return {
				id: contactForm.id,
				message: 'Contact form submitted successfully.',
			};
		});
	}
}
