/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Gemini generateContent API レスポンスの最小限の型定義
 *
 * store / os / instance といった heavyweight な依存を持たない純粋モジュールとして分離することで、
 * レスポンス解析のユニットテストを単独で実行できるようにしている。
 */
export type GeminiPart = { text?: string; file_data?: { mime_type: string; file_uri: string } };
export type GeminiContent = { parts?: GeminiPart[] };
export type GeminiCandidate = { content?: GeminiContent };
export type GeminiGenerateContentResponse = {
	candidates?: GeminiCandidate[];
	error?: { message?: string; code?: number };
};

/**
 * Gemini の生成結果から候補テキストを取り出す
 *
 * @param result Gemini generateContent API のレスポンス
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
	return result.candidates[0].content.parts[0].text ?? '';
}
