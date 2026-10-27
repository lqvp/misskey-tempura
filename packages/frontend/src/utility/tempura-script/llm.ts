/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import type { GeminiGenerateContentResponse, GeminiPart } from '@/utility/tempura-script/llm-response.js';
import { store } from '@/store.js';
import { prefer } from '@/preferences.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { displayLlmError } from '@/utils/errorHandler.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { extractCandidateText } from '@/utility/tempura-script/llm-response.js';

export { extractCandidateText };
export type { GeminiGenerateContentResponse };

const instance = ref<Misskey.entities.MetaDetailed | null>(null);

fetchInstance(true).then((res) => {
	instance.value = res;
});

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

export async function generateGeminiSummary({
	note,
	userContent,
	systemInstruction,
	purpose = 'other',
}: {
	note?: Misskey.entities.Note;
	userContent?: string;
	systemInstruction?: string;
	purpose?: 'note-summary' | 'profile-summary' | 'text-transform' | 'other';
}): Promise<GeminiGenerateContentResponse> {
	const { geminiToken, geminiModel, geminiThinkingBudget, useGeminiLLMAPI, useGeminiWithMedia = true } = prefer.s;

	// ノートからコンテンツを取得
	const text = note?.text || userContent || '';
	const files = note?.files || [];
	const hasMedia = files.length > 0 && useGeminiWithMedia;

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
					throw new Error(i18n.ts._llm._error.cancel);
				}
				if (result === 'disable') {
					prefer.s.useGeminiLLMAPI = false;
					throw new Error(i18n.ts._llm._error.disable);
				}
				// 'fallback'を選択された場合は、geminiTokenを利用して従来の生成処理へフォールバック
			} else {
				throw new Error(i18n.ts._llm._error.serverDisabled);
			}
		} else {
			try {
				// ファイル処理をローカルで行い、URIをサーバーに送信
				const fileUris: { mimeType: string; fileUri: string }[] = [];

				// メディアファイルの処理（画像のみサポート）
				if (hasMedia && geminiToken) { // クライアント側のアップロードにもAPIキーが必要
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
					purpose,
					text: text,
					prompt: systemInstruction ?? '',
					fileUris: fileUris.length > 0 ? fileUris : undefined,
				});
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
