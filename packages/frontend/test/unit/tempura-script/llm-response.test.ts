/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { extractCandidateText } from '@/utility/tempura-script/llm-response.js';

describe('extractCandidateText', () => {
	test('候補のテキストを取り出す', () => {
		const result = extractCandidateText({
			candidates: [{ content: { parts: [{ text: 'こんにちは' }] } }],
		});

		expect(result).toBe('こんにちは');
	});

	test('先頭の候補のみを取り出す', () => {
		const result = extractCandidateText({
			candidates: [
				{ content: { parts: [{ text: 'first' }] } },
				{ content: { parts: [{ text: 'second' }] } },
			],
		});

		expect(result).toBe('first');
	});

	test('candidates が無い場合はエラー', () => {
		expect(() => extractCandidateText({})).toThrow(/candidates, content, parts/);
	});

	test('candidates が空配列の場合はエラー', () => {
		expect(() => extractCandidateText({ candidates: [] })).toThrow(/candidates, content, parts/);
	});

	test('content が無い場合はエラー', () => {
		expect(() => extractCandidateText({ candidates: [{}] })).toThrow(/candidates, content, parts/);
	});

	test('parts が無い場合はエラー', () => {
		expect(() => extractCandidateText({ candidates: [{ content: {} }] })).toThrow(/candidates, content, parts/);
	});

	test('parts が空配列の場合はエラー', () => {
		expect(() => extractCandidateText({ candidates: [{ content: { parts: [] } }] })).toThrow(/candidates, content, parts/);
	});

	test('テキストが空の場合は空文字を返す', () => {
		const result = extractCandidateText({
			candidates: [{ content: { parts: [{}] } }],
		});

		expect(result).toBe('');
	});
});
