/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * LLM API レスポンスの最小限の型定義
 *
 * store / os / instance といった heavyweight な依存を持たない純粋モジュールとして分離することで、
 * レスポンス解析のユニットテストを単独で実行できるようにしている。
 */
export type GeminiPart = { text?: string; thought?: boolean; file_data?: { mime_type: string; file_uri: string } };
export type GeminiContent = { parts?: GeminiPart[] };
export type GeminiCandidate = { content?: GeminiContent };
export type GeminiGenerateContentResponse = {
	candidates?: GeminiCandidate[];
	error?: { message?: string; code?: number };
};

export type OpenAIChatChoice = { message?: { role?: string; content?: string | null } };
export type OpenAIChatCompletionResponse = {
	choices?: OpenAIChatChoice[];
	error?: { message?: string; code?: number };
};

/** Gemini と OpenAI 互換のレスポンスをまとめた型 */
export type LLMResponse = GeminiGenerateContentResponse | OpenAIChatCompletionResponse;

/**
 * Gemini の生成結果から候補テキストを取り出す
 *
 * @param result Gemini generateContent API のレスポンス
 * 応答本文は複数の part に分割されて返ることがあるため、思考 (thought) 以外の
 * テキスト part を順序どおり連結する。
 *
 * @returns 候補のテキスト (本文が無い場合は空文字)
 * @throws レスポンスの形式が不正な場合は Error
 */
export function extractCandidateText(result: GeminiGenerateContentResponse): string {
	// 共通の候補抽出処理
	if (
		!result.candidates ||
		result.candidates.length === 0 ||
		!result.candidates[0].content ||
		!result.candidates[0].content.parts ||
		result.candidates[0].content.parts.length === 0
	) {
		throw new Error('LLM応答の形式が不正です。candidates, content, partsのいずれかが存在しません。');
	}
	return result.candidates[0].content.parts
		.filter((part) => part.thought !== true)
		.map((part) => part.text ?? '')
		.join('');
}

/**
 * OpenAI 互換 Chat Completions の生成結果からテキストを取り出す
 *
 * @param result Chat Completions API のレスポンス
 * @returns アシスタントメッセージのテキスト (本文が無い場合は空文字)
 * @throws レスポンスの形式が不正な場合は Error
 */
export function extractOpenAIChatText(result: OpenAIChatCompletionResponse): string {
	if (!result.choices || result.choices.length === 0 || !result.choices[0].message) {
		throw new Error('LLM応答の形式が不正です。choices または message が存在しません。');
	}
	return result.choices[0].message.content ?? '';
}

/**
 * プロバイダを問わず LLM の生成結果からテキストを取り出す
 *
 * Gemini 形式 (candidates) と OpenAI 互換形式 (choices) を自動判別する。
 *
 * @param result LLM API のレスポンス
 * @returns 生成されたテキスト
 * @throws レスポンスの形式が不正な場合は Error
 */
export function extractLLMText(result: LLMResponse): string {
	if ('choices' in result && result.choices) {
		return extractOpenAIChatText(result);
	}
	return extractCandidateText(result as GeminiGenerateContentResponse);
}
