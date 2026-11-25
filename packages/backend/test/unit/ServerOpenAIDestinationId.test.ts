/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { computeServerOpenAIDestinationId } from '@/core/entities/MetaEntityService.js';

describe('computeServerOpenAIDestinationId', () => {
	const base = {
		serverOpenAIEnabled: true,
		serverOpenAIBaseURL: 'https://api.openai.com/v1',
		serverOpenAIDestinationKey: 'a'.repeat(64),
	};

	test('接続先 URL を変えると ID が変わる', () => {
		expect(computeServerOpenAIDestinationId(base))
			.not.toBe(computeServerOpenAIDestinationId({ ...base, serverOpenAIBaseURL: 'https://llm.example.com/v1' }));
	});

	test('末尾スラッシュや未設定 (既定の OpenAI) は同じ接続先として扱う', () => {
		const id = computeServerOpenAIDestinationId(base);
		expect(computeServerOpenAIDestinationId({ ...base, serverOpenAIBaseURL: 'https://api.openai.com/v1/' })).toBe(id);
		expect(computeServerOpenAIDestinationId({ ...base, serverOpenAIBaseURL: null })).toBe(id);
	});

	test('鍵が異なるサーバーでは同じ URL でも ID が異なり、URL の単純なハッシュと一致しない', () => {
		expect(computeServerOpenAIDestinationId(base))
			.not.toBe(computeServerOpenAIDestinationId({ ...base, serverOpenAIDestinationKey: 'b'.repeat(64) }));
	});

	test('サーバー提供が無効、または鍵が未生成なら null', () => {
		expect(computeServerOpenAIDestinationId({ ...base, serverOpenAIEnabled: false })).toBeNull();
		expect(computeServerOpenAIDestinationId({ ...base, serverOpenAIDestinationKey: null })).toBeNull();
	});
});
