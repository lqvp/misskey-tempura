/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { extractCandidateText, extractOpenAIChatText, extractLLMText } from '@/utility/tempura-script/llm-response.js';

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

	test('複数 part に分割されたテキストを順序どおり連結し thought part を除外する', () => {
		const result = extractCandidateText({
			candidates: [{
				content: {
					parts: [
						{ text: 'internal reasoning', thought: true },
						{ text: '{"topics":' },
						{ text: '[]}' },
					],
				},
			}],
		});

		expect(result).toBe('{"topics":[]}');
	});
});

describe('extractOpenAIChatText', () => {
	test('アシスタントメッセージのテキストを取り出す', () => {
		const result = extractOpenAIChatText({
			choices: [{ message: { role: 'assistant', content: 'こんにちは' } }],
		});

		expect(result).toBe('こんにちは');
	});

	test('choices が無い場合はエラー', () => {
		expect(() => extractOpenAIChatText({})).toThrow(/choices または message/);
	});

	test('choices が空配列の場合はエラー', () => {
		expect(() => extractOpenAIChatText({ choices: [] })).toThrow(/choices または message/);
	});

	test('message が無い場合はエラー', () => {
		expect(() => extractOpenAIChatText({ choices: [{}] })).toThrow(/choices または message/);
	});

	test('content が null の場合は空文字を返す', () => {
		const result = extractOpenAIChatText({
			choices: [{ message: { role: 'assistant', content: null } }],
		});

		expect(result).toBe('');
	});
});

describe('extractLLMText', () => {
	test('Gemini 形式のレスポンスを判別して取り出す', () => {
		const result = extractLLMText({
			candidates: [{ content: { parts: [{ text: 'こんにちは' }] } }],
		});

		expect(result).toBe('こんにちは');
	});

	test('OpenAI 互換形式のレスポンスを判別して取り出す', () => {
		const result = extractLLMText({
			choices: [{ message: { role: 'assistant', content: 'こんにちは' } }],
		});

		expect(result).toBe('こんにちは');
	});
});
