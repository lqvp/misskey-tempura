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
		const metadataResponse = await window.fetch(`${uploadUrl}?key=${apiKey}`, {
			method: 'POST',
			headers: {
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

		const fileInfo = await fileUploadResponse.json();
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
}: {
	note?: Misskey.entities.Note;
	userContent?: string;
	systemInstruction?: string;
}): Promise<any> {
	const { geminiToken, geminiModel, useGeminiLLMAPI, useGeminiWithMedia = true } = prefer.s;

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
					text: text,
					prompt: systemInstruction ?? '',
					fileUris: fileUris.length > 0 ? fileUris : undefined,
				});
			} catch (error: any) {
				if (error.code === 'ROLE_PERMISSION_DENIED') {
					throw new Error(i18n.ts._llm._error.serverPermission);
				}
				throw new Error(i18n.ts._llm._error.serverLLMApi + (error.message || error));
			}
		}
	}

	// ユーザー自身のAPIキーを使用する場合
	if (!geminiToken) {
		throw new Error(i18n.ts._llm._error.tokenMissing);
	}

	// リクエストボディの作成
	const requestBody: any = {
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
		`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiToken}`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody),
		},
	);

	if (!response.ok) {
		throw new Error(i18n.ts._llm._error.api + `${response.status} ${response.statusText}`);
	}

	return response.json();
}

export function extractCandidateText(result: any): string {
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
	return result.candidates[0].content.parts[0].text;
}
