/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MetaService } from '@/core/MetaService.js';
import { ApiError } from '@/server/api/error.js';
import { ContactFormService } from '@/core/ContactFormService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { CaptchaService } from '@/core/CaptchaService.js';
import { EmailService } from '@/core/EmailService.js';

// Meta設定を動的に読み込むため、limit.maxは実行時に決定
export const meta = {
	tags: ['contact'],
	requireCredential: false,

	limit: {
		duration: 60 * 60 * 1000, // 1時間
		max: 3, // デフォルト値（実際には動的に設定される）
	},

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
		captchaFailed: {
			message: 'CAPTCHA verification failed.',
			code: 'CAPTCHA_FAILED',
			id: 'd6e5e8c3-d0e3-4e4f-9faf-1234567890de',
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
			maxLength: 64,
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
export default class extends Endpoint<typeof meta, typeof paramDef> {	// eslint-disable-line import/no-default-export
	constructor(
		private metaService: MetaService,
		private contactFormService: ContactFormService,
		private utilityService: UtilityService,
		private captchaService: CaptchaService,
		private emailService: EmailService,
	) {
		super(meta, paramDef, async (ps, me, _accessToken, _file, _cleanup, ip, headers) => {
			const instance = await this.metaService.fetch();

			// コンタクトフォームが無効な場合
			if (!instance.enableContactForm) {
				throw new ApiError(meta.errors.contactFormDisabled);
			}

			// 認証が必要な場合
			if (instance.contactFormRequireAuth && !me) {
				throw new ApiError(meta.errors.authRequired);
			}

			// CAPTCHA検証（signup/signinと同じロジック）
			if (process.env.NODE_ENV !== 'test') {
				if (instance.enableHcaptcha && instance.hcaptchaSecretKey) {
					await this.captchaService.verifyHcaptcha(instance.hcaptchaSecretKey, ps['hcaptcha-response']).catch(err => {
						throw new ApiError(meta.errors.captchaFailed);
					});
				}

				if (instance.enableMcaptcha && instance.mcaptchaSecretKey && instance.mcaptchaSitekey && instance.mcaptchaInstanceUrl) {
					await this.captchaService.verifyMcaptcha(instance.mcaptchaSecretKey, instance.mcaptchaSitekey, instance.mcaptchaInstanceUrl, ps['m-captcha-response']).catch(err => {
						throw new ApiError(meta.errors.captchaFailed);
					});
				}

				if (instance.enableRecaptcha && instance.recaptchaSecretKey) {
					await this.captchaService.verifyRecaptcha(instance.recaptchaSecretKey, ps['g-recaptcha-response']).catch(err => {
						throw new ApiError(meta.errors.captchaFailed);
					});
				}

				if (instance.enableTurnstile && instance.turnstileSecretKey) {
					await this.captchaService.verifyTurnstile(instance.turnstileSecretKey, ps['cf-turnstile-response']).catch(err => {
						throw new ApiError(meta.errors.captchaFailed);
					});
				}

				if (instance.enableTestcaptcha) {
					await this.captchaService.verifyTestcaptcha(ps['testcaptcha-response']).catch(err => {
						throw new ApiError(meta.errors.captchaFailed);
					});
				}
			}

			// バリデーション: replyMethodに応じた必須フィールドチェック
			if (ps.replyMethod === 'email') {
				if (!ps.email || ps.email.trim() === '') {
					throw new ApiError(meta.errors.invalidReplyMethod);
				}

				const email = ps.email.trim();

				// 基本的なEmail形式バリデーション
				if (!this.utilityService.validateEmailFormat(email)) {
					throw new ApiError(meta.errors.invalidReplyMethod);
				}

				// Active Email Validationが有効な場合、詳細なメール検証を実行
				if (instance.enableActiveEmailValidation) {
					try {
						const emailValidation = await this.emailService.validateEmailForAccount(email);
						if (!emailValidation.available) {
							// 使用済みエラーは除外（コンタクトフォームでは既存メールアドレスも許可）
							if (emailValidation.reason !== 'used') {
								throw new ApiError(meta.errors.invalidReplyMethod);
							}
						}
					} catch (error) {
						// 検証エラーが発生した場合もリジェクト
						throw new ApiError(meta.errors.invalidReplyMethod);
					}
				}
			} else if (ps.replyMethod === 'misskey') {
				if (!ps.misskeyUsername || ps.misskeyUsername.trim() === '') {
					throw new ApiError(meta.errors.invalidReplyMethod);
				}

				// 先頭の@を取り除く（あってもなくても可）
				const misskeyUsername = ps.misskeyUsername.trim().replace(/^@/, '');

				// username@domain 形式の検証
				if (!misskeyUsername.includes('@')) {
					throw new ApiError(meta.errors.invalidReplyMethod);
				}

				// @で分割して検証
				const parts = misskeyUsername.split('@');
				if (parts.length !== 2 || parts[0] === '' || parts[1] === '') {
					throw new ApiError(meta.errors.invalidReplyMethod);
				}

				const [username, domain] = parts;

				// ユーザー名の形式チェック（英数字、アンダースコア、ハイフンのみ）
				if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
					throw new ApiError(meta.errors.invalidReplyMethod);
				}

				// ドメインの基本的な形式チェック
				if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
					throw new ApiError(meta.errors.invalidReplyMethod);
				}
			}

			// カテゴリの動的バリデーション
			const category = ps.category || await this.contactFormService.getDefaultCategory();
			if (!(await this.contactFormService.validateCategory(category))) {
				throw new ApiError(meta.errors.invalidReplyMethod);
			}

			// IPアドレスとUser-Agentの取得
			const ipAddress = ip || null;
			const userAgent = (headers && typeof headers === 'object' && 'user-agent' in headers)
				? String(headers['user-agent'] || '')
				: null;

			// コンタクトフォーム作成
			const contactForm = await this.contactFormService.submit({
				subject: ps.subject,
				content: ps.content,
				replyMethod: ps.replyMethod,
				name: ps.name || null,
				email: ps.replyMethod === 'email' ? ps.email! : null,
				misskeyUsername: ps.replyMethod === 'misskey' ? ps.misskeyUsername! : null,
				category: ps.category,
				ipAddress,
				userAgent,
				userId: me ? me.id : null,
			});

			return {
				id: contactForm.id,
				message: 'Contact form submitted successfully.',
			};
		});
	}
}
