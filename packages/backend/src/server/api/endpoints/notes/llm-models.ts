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
import { ApiError } from '../../error.js';

/**
 * モデルの画像入力対応判定に使うヒント。
 * プロバイダごとにモダリティ情報の格納場所が異なるため、
 * 解釈はフロントエンドに委ねて、サーバーは主要キーをそのまま透過する。
 */
export interface ModelHints {
	id: string;
	input_modalities?: unknown;
	inputModalities?: unknown;
	modality?: unknown;
	type?: unknown;
	architecture?: unknown;
	capabilities?: unknown;
}

export const meta = {
	tags: ['notes'],

	requireCredential: true,
	requiredRolePolicy: 'canUseGeminiLLMAPI',

	kind: 'read:notes',

	limit: {
		duration: ms('1hour'),
		max: 60,
		minInterval: ms('1sec'),
	},

	errors: {
		llmApiError: {
			message: 'LLM API error: {0}',
			code: 'LLM_API_ERROR',
			id: '9a3c1f0e-6f8e-4b4f-9d1f-5f5d3c7b1a10',
		},

		llmNotEnabled: {
			message: 'Server LLM feature is not enabled',
			code: 'LLM_NOT_ENABLED',
			id: '9a3c1f0e-6f8e-4b4f-9d1f-5f5d3c7b1a11',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			models: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						id: {
							type: 'string',
							optional: false, nullable: false,
						},
						input_modalities: {
							optional: true, nullable: true,
						},
						inputModalities: {
							optional: true, nullable: true,
						},
						modality: {
							optional: true, nullable: true,
						},
						type: {
							optional: true, nullable: true,
						},
						architecture: {
							optional: true, nullable: true,
						},
						capabilities: {
							optional: true, nullable: true,
						},
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

/**
 * /models の要素からヒント用キーだけを取り出す (id が無ければ null)
 *
 * @param {unknown} model /models の data[] の要素
 * @returns {ModelHints | null} ヒント (id が文字列でない場合は null)
 */
function pickModelHints(model: unknown): ModelHints | null {
	if (model == null || typeof model !== 'object') return null;
	const record = model as Record<string, unknown>;
	if (typeof record.id !== 'string') return null;
	const hints: ModelHints = { id: record.id };
	for (const key of ['input_modalities', 'inputModalities', 'modality', 'type', 'architecture', 'capabilities'] as const) {
		if (key in record) {
			(hints as unknown as Record<string, unknown>)[key] = record[key];
		}
	}
	return hints;
}

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		private httpRequestService: HttpRequestService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// 権限チェックは requiredRolePolicy (canUseGeminiLLMAPI) で行われる
			if (!this.serverSettings.serverOpenAIEnabled) {
				throw new ApiError(meta.errors.llmNotEnabled);
			}

			const apiKey = this.serverSettings.serverOpenAIApiKey;
			if (!apiKey) {
				throw new ApiError(meta.errors.llmApiError, 'OpenAI-compatible API key is not configured on server');
			}

			try {
				// OpenAI 互換 API: GET {baseURL}/models
				const baseURL = (this.serverSettings.serverOpenAIBaseURL || 'https://api.openai.com/v1').replace(/\/+$/, '');
				const response = await this.httpRequestService.send(`${baseURL}/models`, {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${apiKey}`,
					},
					timeout: 30000,
					isLocalAddressAllowed: false,
				}, {
					throwErrorWhenResponseNotOk: true,
				});

				const data = await response.json() as { data?: unknown[] };
				// ヒント用キーのみ返す (OpenRouter は数百件返すため件数上限も設ける)
				const models = (data.data ?? [])
					.map(pickModelHints)
					.filter((m): m is ModelHints => m != null)
					.slice(0, 500);
				return { models };
			} catch (error) {
				const rawErrorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
				const errorMessage = apiKey
					? rawErrorMessage.split(apiKey).join('[REDACTED]')
					: rawErrorMessage;
				console.error('LLM models API error:', errorMessage);
				throw new ApiError(meta.errors.llmApiError, errorMessage);
			}
		});
	}
}
