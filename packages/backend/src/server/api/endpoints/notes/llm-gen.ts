/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { RoleService } from '@/core/RoleService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,
	requiredRolePolicy: 'canUseGeminiLLMAPI',

	kind: 'write:notes',

	limit: {
		duration: ms('1hour'),
		max: 30,
		minInterval: ms('10sec'),
	},

	errors: {
		emptyText: {
			message: 'Text is empty.',
			code: 'EMPTY_TEXT',
			id: '7bfbaf47-52fe-42fb-9b13-0626265cef21',
		},

		emptyPrompt: {
			message: 'Prompt is empty.',
			code: 'EMPTY_PROMPT',
			id: 'b27d240a-5fd4-41af-9346-286b22f08eab',
		},

		llmApiError: {
			message: 'LLM API error: {0}',
			code: 'LLM_API_ERROR',
			id: '7767ca48-e402-426e-8583-75091f5337eb',
		},

		llmNotEnabled: {
			message: 'Server LLM feature is not enabled',
			code: 'LLM_NOT_ENABLED',
			id: '58f1cb83-fb0b-47be-9dc8-0cf39ecf44e2',
		},

		accessDenied: {
			message: 'Access denied. Requires canUseGeminiLLMAPI role.',
			code: 'ACCESS_DENIED',
			id: '5eb8d909-2540-4970-90b8-dd6f86088121',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		text: { type: 'string' },
		prompt: { type: 'string' },
		provider: {
			type: 'string',
			enum: ['gemini', 'openai'],
			default: 'gemini',
		},
		fileUris: {
			type: 'array',
			nullable: true,
			items: {
				type: 'object',
				properties: {
					mimeType: { type: 'string' },
					fileUri: { type: 'string' },
				},
				required: ['mimeType', 'fileUri'],
			},
		},
	},
	required: ['text', 'prompt'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		private httpRequestService: HttpRequestService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const policies = await this.roleService.getUserPolicies(me.id);

			if (!policies.canUseGeminiLLMAPI) {
				throw new ApiError(meta.errors.accessDenied);
			}

			if (ps.text == null || ps.text === '') {
				throw new ApiError(meta.errors.emptyText);
			}

			if (ps.prompt == null || ps.prompt === '') {
				throw new ApiError(meta.errors.emptyPrompt);
			}

			const provider = ps.provider ?? 'gemini';

			// プロバイダごとのサーバー設定を取得
			// - gemini: API キーのみで OK（URL は固定）
			// - openai: 互換 API のためベース URL を設定できる（未設定なら公式 API）
			const apiKey = provider === 'openai'
				? this.serverSettings.serverOpenAIApiKey
				: this.serverSettings.serverGeminiApiKey;
			const enabled = provider === 'openai'
				? this.serverSettings.serverOpenAIEnabled
				: this.serverSettings.serverGeminiEnabled;

			if (!enabled) {
				throw new ApiError(meta.errors.llmNotEnabled);
			}

			if (!apiKey) {
				throw new ApiError(meta.errors.llmApiError, `LLM API key is not configured on server (${provider})`);
			}

			try {
				if (provider === 'openai') {
					// OpenAI 互換 API (Chat Completions)
					const baseURL = (this.serverSettings.serverOpenAIBaseURL || 'https://api.openai.com/v1').replace(/\/+$/, '');
					const model = this.serverSettings.serverOpenAIModels || 'gpt-4o-mini';
					const url = `${baseURL}/chat/completions`;

					// ユーザーコンテンツ (テキスト + 画像URL)
					const content: any[] = [{ type: 'text', text: ps.text }];
					if (ps.fileUris && ps.fileUris.length > 0) {
						for (const fileInfo of ps.fileUris) {
							content.push({
								type: 'image_url',
								image_url: { url: fileInfo.fileUri },
							});
						}
					}

					const requestBody = JSON.stringify({
						model,
						messages: [
							{ role: 'system', content: ps.prompt },
							{ role: 'user', content },
						],
					});

					const response = await this.httpRequestService.send(url, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							Authorization: `Bearer ${apiKey}`,
						},
						body: requestBody,
						timeout: 30000,
						isLocalAddressAllowed: false,
					}, {
						throwErrorWhenResponseNotOk: true,
					});

					const responseData = await response.json();
					return responseData;
				}

				// Gemini (generateContent)
				const serverGeminiModels = this.serverSettings.serverGeminiModels;

				// リクエストボディのコンテンツ部分を作成
				const parts: any[] = [{ text: ps.text }];

				// ファイルURIがある場合は追加
				if (ps.fileUris && ps.fileUris.length > 0) {
					for (const fileInfo of ps.fileUris) {
						parts.push({
							file_data: {
								mime_type: fileInfo.mimeType,
								file_uri: fileInfo.fileUri,
							},
						});
					}
				}

				// リクエストボディの作成
				const requestBody = JSON.stringify({
					system_instruction: {
						parts: [{ text: ps.prompt }],
					},
					contents: [{
						parts: parts,
					}],
				});

				// Gemini APIへのリクエスト
				// API キーは URL に入れるとエラーやログに出るので、ヘッダーで送る
				const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(serverGeminiModels)}:generateContent`;

				const response = await this.httpRequestService.send(url, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-goog-api-key': apiKey,
					},
					body: requestBody,
					timeout: 30000, // 30秒タイムアウト
					isLocalAddressAllowed: false,
				}, {
					throwErrorWhenResponseNotOk: true,
				});

				// JSONレスポンスを返す
				const responseData = await response.json();
				return responseData;
			} catch (error) {
				// 念のため、メッセージにキーが含まれていたら隠してから記録・返却する
				const rawErrorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
				const errorMessage = apiKey
					? rawErrorMessage.split(apiKey).join('[REDACTED]')
					: rawErrorMessage;
				console.error('LLM API error:', errorMessage);
				throw new ApiError(meta.errors.llmApiError, errorMessage);
			}
		});
	}
}
