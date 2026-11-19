/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import { store } from '@/store.js';
import { prefer } from '@/preferences.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { displayLlmError } from '@/utils/errorHandler.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { extractLLMText, extractCandidateText } from '@/utility/tempura-script/llm-response.js';
import { geminiModels } from '@/utility/tempura-script/models.js';
import type { GeminiGenerateContentResponse, GeminiPart, LLMResponse } from '@/utility/tempura-script/llm-response.js';

export { extractCandidateText, extractLLMText };
export type { GeminiGenerateContentResponse, LLMResponse };

export type LLMProvider = 'gemini' | 'openai';

const instance = ref<Misskey.entities.MetaDetailed | null>(null);

fetchInstance(true).then((res) => {
	instance.value = res;
});

function serverLlmEnabled(provider: LLMProvider): boolean {
	if (provider === 'openai') return instance.value?.serverOpenAIEnabled === true;
	return instance.value?.serverGeminiEnabled === true;
}

/**
 * Gemini APIにファイルをアップロードする
 * @param file アップロードするファイル情報
 * @param apiKey Gemini API Key
 * @returns アップロードされたファイルのURI
 */
async function uploadFileToGemini(file: Misskey.entities.DriveFile, apiKey: string): Promise<string> {
	try {
		// ファイルをダウンロードしてバイナリデータとして取得
		const fileResponse = await window.fetch(file.url);
		if (!fileResponse.ok) {
			throw new Error(i18n.ts._llm._error.fileDownload);
		}
		const fileBlob = await fileResponse.blob();

		// Gemini APIのファイルアップロードエンドポイント
		const uploadUrl = 'https://generativelanguage.googleapis.com/upload/v1beta/files';

		// メタデータアップロードのリクエスト
		// API キーは URL に入れるとログや履歴に残りやすいのでヘッダーで送る
		const metadataResponse = await window.fetch(uploadUrl, {
			method: 'POST',
			headers: {
				'x-goog-api-key': apiKey,
				'X-Goog-Upload-Protocol': 'resumable',
				'X-Goog-Upload-Command': 'start',
				'X-Goog-Upload-Header-Content-Length': String(fileBlob.size),
				'X-Goog-Upload-Header-Content-Type': file.type,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				file: { display_name: file.name },
			}),
		});

		if (!metadataResponse.ok) {
			throw new Error(i18n.ts._llm._error.uploadInit);
		}

		// アップロードURLを取得
		const uploadSessionUrl = metadataResponse.headers.get('X-Goog-Upload-URL');
		if (!uploadSessionUrl) {
			throw new Error(i18n.ts._llm._error.uploadUrlNotFound);
		}

		// 実際のファイルデータをアップロード
		const fileUploadResponse = await window.fetch(uploadSessionUrl, {
			method: 'POST',
			headers: {
				'Content-Length': String(fileBlob.size),
				'X-Goog-Upload-Offset': '0',
				'X-Goog-Upload-Command': 'upload, finalize',
			},
			body: fileBlob,
		});

		if (!fileUploadResponse.ok) {
			throw new Error(i18n.ts._llm._error.upload);
		}

		const fileInfo = await fileUploadResponse.json() as { file?: { uri?: string } };
		if (!fileInfo.file || !fileInfo.file.uri) {
			throw new Error(i18n.ts._llm._error.uploadedFileUri);
		}

		return fileInfo.file.uri;
	} catch (error) {
		console.error('ファイルアップロードエラー:', error);
		throw error;
	}
}

/**
 * 現在の設定で利用可能なモデル一覧を取得する
 *
 * - サーバー提供モード: notes/llm-models エンドポイント経由で取得
 * - ユーザー直指定モード: 各プロバイダの models API を直接呼び出す
 *
 * @returns モデル ID のリスト (取得に失敗した場合は空配列)
 */
export async function fetchAvailableModels(): Promise<string[]> {
	const { llmProvider, useGeminiLLMAPI, geminiToken, openaiToken, openaiBaseUrl } = prefer.s;
	const provider = (llmProvider ?? 'gemini') as LLMProvider;

	if (useGeminiLLMAPI) {
		try {
			const res = await misskeyApi('notes/llm-models', { provider });
			return res.models;
		} catch {
			return [];
		}
	}

	try {
		if (provider === 'openai') {
			if (!openaiToken) return [];
			const baseURL = (openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
			const response = await window.fetch(`${baseURL}/models`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${openaiToken}`,
				},
			});
			if (!response.ok) return [];
			const data = await response.json() as { data?: { id?: string }[] };
			return (data.data ?? []).map(m => m.id).filter((id): id is string => typeof id === 'string');
		}

		if (!geminiToken) return [];
		const response = await window.fetch('https://generativelanguage.googleapis.com/v1beta/models', {
			method: 'GET',
			headers: {
				'x-goog-api-key': geminiToken,
			},
		});
		if (!response.ok) return [];
		const data = await response.json() as { models?: { name?: string }[] };
		return (data.models ?? [])
			.filter(m => m.name != null && m.name.startsWith('models/'))
			.map(m => (m as { name: string }).name.replace(/^models\//, ''));
	} catch {
		return [];
	}
}

export interface GenerateLLMOptions {
	note?: Misskey.entities.Note;
	userContent?: string;
	systemInstruction?: string;
}

/**
 * サーバー提供の LLM API (notes/llm-gen) を呼び出す
 */
async function generateViaServer(provider: LLMProvider, { note, userContent, systemInstruction }: GenerateLLMOptions): Promise<LLMResponse> {
	const text = note?.text || userContent || '';
	const files = note?.files || [];
	const { useGeminiWithMedia = true, geminiToken } = prefer.s;
	const hasMedia = files.length > 0 && useGeminiWithMedia;

	const fileUris: { mimeType: string; fileUri: string }[] = [];

	// メディアファイルの処理（画像のみサポート、Gemini のみ）
	if (provider === 'gemini' && hasMedia && geminiToken) { // クライアント側のアップロードにもAPIキーが必要
		try {
			const mediaFiles = files.filter(file =>
				file.type.startsWith('image/') && !file.type.includes('gif'),
			);

			if (mediaFiles.length > 0) {
				// 最大4つの画像のみ処理（Gemini APIの制限に基づく）
				const filesToProcess = mediaFiles.slice(0, 4);

				// 各ファイルをアップロードしてリクエストに追加
				for (const file of filesToProcess) {
					const fileUri = await uploadFileToGemini(file, geminiToken);
					fileUris.push({
						mimeType: file.type,
						fileUri: fileUri,
					});
				}
			}
		} catch (error) {
			console.error('メディアファイル処理エラー:', error);
			os.alert({
				type: 'error',
				title: 'メディア処理エラー',
				text: 'ファイルの処理に失敗しました。テキストのみで要約を続行します。',
			});
		}
	}

	// サーバーAPIを呼び出し
	return await misskeyApi('notes/llm-gen', {
		text: text,
		prompt: systemInstruction ?? '',
		provider,
		fileUris: fileUris.length > 0 ? fileUris : undefined,
	}) as LLMResponse;
}

/**
 * OpenAI 互換 API (Chat Completions) をユーザーのキーで直接呼び出す
 */
async function generateOpenAIDirect({ note, userContent, systemInstruction }: GenerateLLMOptions): Promise<LLMResponse> {
	const { openaiToken, openaiBaseUrl, openaiModel } = prefer.s;

	if (!openaiToken) {
		throw new Error(i18n.ts._llm._error.tokenMissing);
	}

	const text = note?.text || userContent || '';
	const baseURL = (openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
	// モデルを空にしている場合は既定のモデルを使う
	const model = openaiModel?.trim() || 'gpt-4o-mini';

	const requestBody = {
		model,
		messages: [
			{ role: 'system', content: systemInstruction ?? '' },
			{ role: 'user', content: text },
		],
	};

	const response = await window.fetch(`${baseURL}/chat/completions`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${openaiToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(requestBody),
	});

	if (!response.ok) {
		throw new Error(i18n.ts._llm._error.api + `${response.status} ${response.statusText}`);
	}

	return response.json() as Promise<LLMResponse>;
}

/**
 * 現在の設定 (llmProvider) に応じて LLM による生成を実行する
 *
 * サーバー提供モード (useGeminiLLMAPI) が有効ならサーバー経由、
 * それ以外はユーザーが設定したキーで直接 API を呼び出す。
 *
 * @returns LLM API のレスポンス (extractLLMText でテキストを取り出す)
 */
export async function generateLLMResponse(options: GenerateLLMOptions): Promise<LLMResponse> {
	const { llmProvider, useGeminiLLMAPI } = prefer.s;
	const provider = (llmProvider ?? 'gemini') as LLMProvider;

	if (useGeminiLLMAPI) {
		// サーバーで対象プロバイダが有効になっているかチェック
		if (!serverLlmEnabled(provider)) {
			// サーバー側が無効な場合、ユーザー直指定にフォールバックするか確認
			const hasUserKey = provider === 'openai' ? !!prefer.s.openaiToken : !!prefer.s.geminiToken;
			if (hasUserKey) {
				const { canceled, result } = await os.actions({
					type: 'question',
					title: 'LLM API利用方法の選択',
					text: 'サーバー提供のLLM APIが有効になっていません。ユーザー指定のAPI tokenを使って生成を継続しますか？ または、LLM API の利用を無効にしますか？',
					actions: [
						{ value: 'fallback', text: 'ユーザーのAPI tokenを使用する' },
						{ value: 'disable', text: 'LLM APIの利用を無効にする', danger: true },
					],
				});
				if (canceled) {
					throw new Error(i18n.ts._llm._error.cancel);
				}
				if (result === 'disable') {
					prefer.s.useGeminiLLMAPI = false;
					throw new Error(i18n.ts._llm._error.disable);
				}
				// 'fallback'を選択された場合はユーザー直指定で生成処理へフォールバック
			} else {
				throw new Error(i18n.ts._llm._error.serverDisabled);
			}
		} else {
			try {
				return await generateViaServer(provider, options);
			} catch (error: unknown) {
				const err = error as { code?: string; message?: string };
				if (err?.code === 'ROLE_PERMISSION_DENIED') {
					throw new Error(i18n.ts._llm._error.serverPermission);
				}
				throw new Error(i18n.ts._llm._error.serverLLMApi + (err?.message || String(error)));
			}
		}
	}

	// ユーザー自身のAPIキーを使用する場合
	if (provider === 'openai') {
		return await generateOpenAIDirect(options);
	}

	return await generateGeminiSummary(options);
}

export async function generateGeminiSummary({
	note,
	userContent,
	systemInstruction,
}: {
	note?: Misskey.entities.Note;
	userContent?: string;
	systemInstruction?: string;
}): Promise<GeminiGenerateContentResponse> {
	const { geminiToken, geminiModel, geminiThinkingBudget, useGeminiWithMedia = true } = prefer.s;

	// ノートからコンテンツを取得
	const text = note?.text || userContent || '';
	const files = note?.files || [];
	const hasMedia = files.length > 0 && useGeminiWithMedia;

	// ユーザー自身のAPIキーを使用する場合
	if (!geminiToken) {
		throw new Error(i18n.ts._llm._error.tokenMissing);
	}

	// リクエストボディの作成
	const requestBody: {
		system_instruction?: { parts: { text: string }[] };
		contents: { parts: GeminiPart[] }[];
		generationConfig: { thinkingConfig: { thinkingBudget: number } };
	} = {
		system_instruction: systemInstruction
			? {
				parts: [{ text: systemInstruction }],
			}
			: undefined,
		contents: [
			{
				parts: [{ text: text }],
			},
		],
		generationConfig: {
			thinkingConfig: {
				thinkingBudget: geminiThinkingBudget,
			},
		},
	};

	// メディアファイルの処理（画像のみサポート）
	if (hasMedia) {
		try {
			const mediaFiles = files.filter(file =>
				file.type.startsWith('image/') && !file.type.includes('gif'),
			);

			if (mediaFiles.length > 0) {
				// 最大4つの画像のみ処理（Gemini APIの制限に基づく）
				const filesToProcess = mediaFiles.slice(0, 4);

				// requestBodyのpartsを更新
				requestBody.contents[0].parts = [{ text: text }];

				// 各ファイルをアップロードしてリクエストに追加
				for (const file of filesToProcess) {
					const fileUri = await uploadFileToGemini(file, geminiToken);
					requestBody.contents[0].parts.push({
						file_data: {
							mime_type: file.type,
							file_uri: fileUri,
						},
					});
				}
			}
		} catch (error) {
			console.error('メディアファイル処理エラー:', error);
			// ファイル処理に失敗した場合はテキストのみでフォールバック
			os.alert({
				type: 'error',
				title: 'メディア処理エラー',
				text: 'ファイルの処理に失敗しました。テキストのみで要約を続行します。',
			});
		}
	}

	// Gemini APIにリクエスト送信
	const response = await window.fetch(
		// モデルを空にしている場合は既定のモデルを使う (以前は models/null を呼んで失敗していた)
		`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel?.trim() || 'gemini-2.5-flash')}:generateContent`,
		{
			method: 'POST',
			headers: {
				'x-goog-api-key': geminiToken,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody),
		},
	);

	if (!response.ok) {
		throw new Error(i18n.ts._llm._error.api + `${response.status} ${response.statusText}`);
	}

	return response.json() as Promise<GeminiGenerateContentResponse>;
}
