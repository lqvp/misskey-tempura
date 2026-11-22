/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { DI } from '@/di-symbols.js';
import { StatusError } from '@/misc/status-error.js';
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

	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		text: { type: 'string', maxLength: 131072 },
		prompt: { type: 'string', maxLength: 131072 },
		baseUrl: { type: 'string', nullable: true },
		apiKey: { type: 'string', nullable: true },
		model: { type: 'string', nullable: true },
		fileUris: {
			type: 'array',
			nullable: true,
			items: { type: 'string' },
			maxItems: 4,
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
	) {
		super(meta, paramDef, async (ps, me) => {
			// 権限チェックは requiredRolePolicy (canUseGeminiLLMAPI) で行われる
			if (ps.text == null || ps.text === '') {
				throw new ApiError(meta.errors.emptyText);
			}

			if (ps.prompt == null || ps.prompt === '') {
				throw new ApiError(meta.errors.emptyPrompt);
			}

			// ユーザー指定パラメータ (ユーザー直指定モード) の場合はサーバー設定の有効状態を参照しない
			const userSpecified = ps.baseUrl != null || ps.apiKey != null;

			if (!userSpecified && !this.serverSettings.serverOpenAIEnabled) {
				throw new ApiError(meta.errors.llmNotEnabled);
			}

			// ユーザーが baseUrl を指定した場合、サーバーAPIキーを外部ホストへ送出しない
			const apiKey = ps.apiKey != null ? ps.apiKey
				: ps.baseUrl != null ? null
				: this.serverSettings.serverOpenAIApiKey;
			if (!apiKey) {
				// baseUrl 指定時はユーザー指定モード扱いのため apiKey が必須、
				// それ以外はサーバー設定のキーが必要
				throw new ApiError(meta.errors.llmApiError, ps.baseUrl != null
					? 'apiKey is required when baseUrl is specified'
					: 'OpenAI-compatible API key is not configured on server');
			}

			const baseURL = (ps.baseUrl || this.serverSettings.serverOpenAIBaseURL || 'https://api.openai.com/v1').replace(/\/+$/, '');
			const model = ps.model || this.serverSettings.serverOpenAIModels || 'gpt-4o-mini';
			const url = `${baseURL}/chat/completions`;

			const textContent = { type: 'text', text: ps.text };
			// 画像は最大4件まで (API 直叩きに対するサーバー側の上限)
			const imageContents = (ps.fileUris ?? []).slice(0, 4).map(fileUri => ({
				type: 'image_url',
				image_url: { url: fileUri },
			}));

			const send = async (content: string | unknown[]) => {
				return await this.httpRequestService.send(url, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${apiKey}`,
					},
					body: JSON.stringify({
						model,
						messages: [
							{ role: 'system', content: ps.prompt },
							{ role: 'user', content },
						],
					}),
					timeout: 30000,
					isLocalAddressAllowed: false,
				}, {
					throwErrorWhenResponseNotOk: false,
				});
			};
			const toStatusError = (response: Awaited<ReturnType<typeof send>>) => new StatusError(`${response.status} ${response.statusText}`, response.status, response.statusText);

			try {
				const response = await send(imageContents.length > 0 ? [textContent, ...imageContents] : ps.text);
				if (response.ok) return await response.json();

				// クライアントは使われるモデルが画像に対応しているか分からずに画像を付けてくるため、
				// 画像が原因で拒否されたときだけテキストで送り直す。
				// 画像と関係ない入力エラーまで送り直すと、画像を黙って捨てた結果を画像込みの結果に見せてしまう
				if (imageContents.length > 0 && (response.status === 400 || response.status === 422)) {
					const body = await response.text().catch(() => '');
					if (/image|vision|multimodal|modalit/i.test(body)) {
						const retried = await send(ps.text);
						if (retried.ok) return await retried.json();
						throw toStatusError(retried);
					}
				}
				throw toStatusError(response);
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
