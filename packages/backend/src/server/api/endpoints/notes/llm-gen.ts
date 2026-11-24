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

/**
 * 上流の OpenAI 互換 API への 1 回の送信あたりのタイムアウト
 *
 * クライアント直指定モードの予算 (LLM_REQUEST_TIMEOUT_MS = 120 秒) より短くしない。
 * HttpRequestService はこの値を AbortController の abort に使うため、生成が終わる前に
 * 打ち切るとプロバイダには生成・課金をさせたまま利用者にはエラーを返すことになる。
 * 長いタイムラインの TL ダイジェスト要約は低速なモデルでは 30 秒を超えるため、
 * 旧値 (30 秒) は直指定モードより不利なだけだった。
 * サーバーモードはクライアント側にタイムアウトが無い (中止は利用者のキャンセルのみ)。
 *
 * 画像フォールバックで最大 2 回送信しうるため、合計は最大 240 秒になる。
 * 現在のところ両モードとも 240 秒を超えた時点でクライアントが打ち切る経路は無い。
 */
const LLM_UPSTREAM_TIMEOUT_MS = 120_000;

/**
 * 画像付きの送信が入力エラーで拒否されたときに本文だけで送り直すまでの猶予
 *
 * 400/422 は推論前の拒否なので通常は二重課金にならないが、全く同じ結果になる
 * 再送 (コンテキスト長超過・モデレーション・不正なリクエスト等) に最大 120 秒
 * 費やさないよう、再送は短いタイムアウトで諦める。
 */
const LLM_UPSTREAM_RETRY_TIMEOUT_MS = 60_000;

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

			// タイムアウトは呼び出しごとに独立させる (再送に前回の残り時間を引き継がない)
			const send = async (content: string | unknown[], timeout: number = LLM_UPSTREAM_TIMEOUT_MS) => {
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
					timeout,
					isLocalAddressAllowed: false,
				}, {
					throwErrorWhenResponseNotOk: false,
				});
			};
			const toStatusError = (response: Awaited<ReturnType<typeof send>>) => new StatusError(`${response.status} ${response.statusText}`, response.status, response.statusText);

			try {
				const response = await send(imageContents.length > 0 ? [textContent, ...imageContents] : ps.text);
				if (response.ok) return await response.json();

				// クライアントは使われるモデルが画像に対応しているか分からずに画像を付けてくる。
				// 画像非対応を示すエラーの形式はプロバイダーごとに異なり判別できないため、
				// 入力エラーで拒否されたら本文だけで送り直す (画像と無関係な入力エラーなら再送も失敗する)
				//
				// 課金について: 400/422 は入力の検証で拒否された応答であり、プロバイダが推論を
				// 実行する前の段階で返るため、再送しても生成分の二重課金にはならない
				// (推論後に課金される 5xx では再送しない)。ただし画像と無関係な入力エラー
				// (コンテキスト長超過・モデレーション等) でも必ず 1 回は再送するので、
				// その経路で余計に待たせないよう再送は短いタイムアウトで打ち切る。
				if (imageContents.length > 0 && (response.status === 400 || response.status === 422)) {
					const retried = await send(ps.text, LLM_UPSTREAM_RETRY_TIMEOUT_MS);
					if (retried.ok) return await retried.json();
					throw toStatusError(retried);
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
