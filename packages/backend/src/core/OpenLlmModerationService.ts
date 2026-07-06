/*
 * SPDX-FileCopyrightText: chan-mai and lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta, MiNote } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { LlmModerationQueueService } from '@/core/LlmModerationQueueService.js';
import { bindThis } from '@/decorators.js';

type ModerationInput = {
	text?: string | null;
	cw?: string | null;
	pollChoices?: string[] | null;
};

const DEFAULT_OPEN_LLM_MODERATION_API_URL = 'https://api.openai.com/v1/moderations';
const DEFAULT_OPEN_LLM_MODERATION_MODEL = 'omni-moderation-latest';

@Injectable()
export class OpenLlmModerationService {
	private logger;

	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		private httpRequestService: HttpRequestService,
		private llmModerationQueueService: LlmModerationQueueService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('openllm-moderation');
	}

	@bindThis
	public async moderateNote(note: MiNote, input: ModerationInput): Promise<void> {
		if (!this.meta.openLlmModerationEnabled) return;
		if (!this.meta.openLlmModerationApiKey) return;

		const isRemote = note.userHost != null;
		if (isRemote && !this.meta.openLlmModerationIncludeRemote) return;

		const visibilities = this.meta.openLlmModerationVisibilities ?? [];
		if (!visibilities.includes(note.visibility)) return;

		const content = this.buildInputText(input);
		if (!content) return;

		const model = this.meta.openLlmModerationModel ?? DEFAULT_OPEN_LLM_MODERATION_MODEL;
		const apiUrl = this.meta.openLlmModerationApiUrl ?? DEFAULT_OPEN_LLM_MODERATION_API_URL;
		// カスタムURL設定時のみローカルアドレスを許可
		const isLocalAddressAllowed = this.meta.openLlmModerationApiUrl != null;

		try {
			const response = await this.httpRequestService.send(apiUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.meta.openLlmModerationApiKey}`,
				},
				body: JSON.stringify({
					model,
					input: content,
				}),
				timeout: 30000,
				isLocalAddressAllowed,
			}, {
				throwErrorWhenResponseNotOk: true,
			});

			const data = await response.json() as {
				id?: string;
				model?: string;
				results?: Array<{
					flagged?: boolean;
					categories?: Record<string, boolean>;
					category_scores?: Record<string, number>;
				}>;
			};

			const result = data.results?.[0];
			if (!result?.flagged) return;

			const categories = result.categories ?? {};
			const flaggedCategories = Object.entries(categories)
				.filter(([, value]) => value)
				.map(([key]) => key);

			await this.llmModerationQueueService.enqueue({
				note,
				provider: 'openai',
				model: data.model ?? model,
				flaggedCategories,
				categoryScores: result.category_scores ?? {},
				rawResult: result ?? null,
			});
		} catch (err) {
			this.logger.error('LLM moderation failed', { err });
		}
	}

	private buildInputText(input: ModerationInput): string | null {
		const parts: string[] = [];
		if (input.cw) parts.push(`[CW] ${input.cw}`);
		if (input.text) parts.push(input.text);
		if (input.pollChoices && input.pollChoices.length > 0) {
			parts.push(`Poll: ${input.pollChoices.join(' / ')}`);
		}

		const joined = parts.join('\n\n').trim();
		if (joined.length === 0) return null;

		return joined.slice(0, 8000);
	}
}
