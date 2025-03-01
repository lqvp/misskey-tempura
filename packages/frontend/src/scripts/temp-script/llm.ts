/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defaultStore } from '@/store.js';
import { misskeyApi } from '@/scripts/misskey-api.js';

export async function generateGeminiSummary({
	userContent,
	systemInstruction,
}: {
	userContent: string;
	systemInstruction?: string;
}): Promise<any> {
	const { geminiToken, geminiModels, useGeminiLLMAPI } = defaultStore.state;

	// サーバー提供のLLM APIを使用する場合
	if (useGeminiLLMAPI) {
		try {
			return await misskeyApi('notes/llm-gen', {
				text: userContent,
				prompt: systemInstruction ?? '',
			});
		} catch (error: any) {
			if (error.code === 'ROLE_PERMISSION_DENIED') {
				throw new Error('サーバー提供のLLM APIを使用する権限がありません。');
			}
			throw new Error(`サーバーLLM API エラー: ${error.message || error}`);
		}
	}

	// ユーザー自身のAPIキーを使用する場合（従来の動作）
	if (!geminiToken) {
		throw new Error('Gemini API tokenがありません。');
	}

	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${geminiModels}:generateContent?key=${geminiToken}`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				system_instruction: systemInstruction ? {
					parts: [{ text: systemInstruction }],
				} : undefined,
				contents: [{
					parts: [{ text: userContent }],
				}],
			}),
		},
	);

	if (!response.ok) {
		throw new Error('Failed to get summary from Gemini API.');
	}
	return response.json();
}
