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

		accessDenied: {
			message: 'Access denied. Requires canUseGeminiLLMAPI role.',
			code: 'ACCESS_DENIED',
			id: '9a3c1f0e-6f8e-4b4f-9d1f-5f5d3c7b1a12',
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
					type: 'string',
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		provider: {
			type: 'string',
			enum: ['gemini', 'openai'],
			default: 'gemini',
		},
	},
	required: [],
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

			const provider = ps.provider ?? 'gemini';

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

					const data = await response.json() as { data?: { id?: string }[] };
					const models = (data.data ?? [])
						.map(m => m.id)
						.filter((id): id is string => typeof id === 'string');
					return { models };
				}

				// Gemini: GET /v1beta/models
				const response = await this.httpRequestService.send('https://generativelanguage.googleapis.com/v1beta/models', {
					method: 'GET',
					headers: {
						// API キーは URL に入れるとエラーやログに出るので、ヘッダーで送る
						'x-goog-api-key': apiKey,
					},
					timeout: 30000,
					isLocalAddressAllowed: false,
				}, {
					throwErrorWhenResponseNotOk: true,
				});

				const data = await response.json() as { models?: { name?: string }[] };
				const models = (data.models ?? [])
					// generateContent をサポートするモデルのみを返す
					.filter(m => m.name != null && m.name.startsWith('models/'))
					.map(m => (m as { name: string }).name.replace(/^models\//, ''));
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
