/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import { defaultStore } from '@/store.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { displayLlmError } from '@/utils/errorHandler.js';
import * as os from '@/os.js';

const instance = ref<Misskey.entities.MetaDetailed | null>(null);

fetchInstance(true).then((res) => {
	instance.value = res;
});

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
		// サーバーでGeminiが有効になっているかチェック
		if (!instance.value || !instance.value.serverGeminiEnabled) {
			// geminiTokenがあればフォールバックの選択肢を表示
			if (geminiToken) {
				const { canceled, result } = await os.actions({
					type: 'question',
					title: 'Gemini API利用方法の選択',
					text: 'サーバー提供のGemini APIが有効になっていません。ユーザー指定のGemini API tokenを使って生成を継続しますか？ または、Gemini API の利用を無効にしますか？',
					actions: [
						{ value: 'fallback', text: 'ユーザーのGemini tokenを使用する' },
						{ value: 'disable', text: 'Gemini APIの利用を無効にする', danger: true },
					],
				});
				if (canceled) {
					return displayLlmError(new Error('操作がキャンセルされました。'));
				}
				if (result === 'disable') {
					defaultStore.state.useGeminiLLMAPI = false;
					return displayLlmError(new Error('Gemini APIの利用を無効にしました。'));
				}
				// 'fallback'を選択された場合は、geminiTokenを利用して従来の生成処理へフォールバック
			} else {
				return displayLlmError(new Error('サーバー提供のLLM APIが有効になっていません。'));
			}
		} else {
			try {
				return await misskeyApi('notes/llm-gen', {
					text: userContent,
					prompt: systemInstruction ?? '',
				});
			} catch (error: any) {
				if (error.code === 'ROLE_PERMISSION_DENIED') {
					return displayLlmError(new Error('サーバー提供のLLM APIを使用する権限がありません。'));
				}
				return displayLlmError(new Error(`サーバーLLM API エラー: ${error.message || error}`));
			}
		}
	}

	// ユーザー自身のAPIキーを使用する場合（従来の動作）
	if (!geminiToken) {
		return displayLlmError(new Error('Gemini API tokenがありません。'));
	}

	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${geminiModels}:generateContent?key=${geminiToken}`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				system_instruction: systemInstruction
					? {
						parts: [{ text: systemInstruction }],
					}
					: undefined,
				contents: [
					{
						parts: [{ text: userContent }],
					},
				],
			}),
		},
	);

	if (!response.ok) {
		return displayLlmError(new Error('Gemini APIからの要約の取得に失敗しました。'));
	}
	return response.json();
}
