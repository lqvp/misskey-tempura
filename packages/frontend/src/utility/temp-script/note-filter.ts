/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { prefer } from '@/preferences.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';

// キャッシュ用
const filteredNoteCache = new Map<string, FilterResult>();
const cacheExpiryTime = 1000 * 60 * 60; // 1時間キャッシュを保持

// フィルタリング結果の型定義
export interface FilterResult {
	filtered: boolean;
	reason: string;
	timestamp: number;
}

/**
 * Gemini APIを使ってノート内容をフィルタリングします
 *
 * @param note フィルタリングするノート
 * @returns フィルタリング結果（filtered: true/false, reason: 理由）
 */
export async function filterNoteContent(note: Misskey.entities.Note): Promise<FilterResult> {
	// 設定が無効になっている場合はフィルタリングしない
	if (!prefer.s.useLlmContentFilter) {
		return { filtered: false, reason: 'Content filter is disabled', timestamp: Date.now() };
	}

	// キャッシュチェック
	const cachedResult = getFromCache(note.id);
	if (cachedResult) {
		return cachedResult;
	}

	// テキストが空の場合はフィルタリングしない
	if (!note.text && (!note.files || note.files.length === 0)) {
		return saveToCache(note.id, { filtered: false, reason: 'No content to filter', timestamp: Date.now() });
	}

	const { geminiToken, geminiModels, useGeminiLLMAPI } = prefer.s;

	// サーバー提供のLLM APIを使用する場合
	if (useGeminiLLMAPI) {
		try {
			const instance = await fetchInstance(true);

			// サーバーでGeminiが有効になっているかチェック
			if (!instance || !instance.serverGeminiEnabled) {
				// geminiTokenがあればフォールバックする
				if (!geminiToken) {
					return saveToCache(note.id, { filtered: false, reason: 'Server LLM API is not enabled', timestamp: Date.now() });
				}
				// ユーザートークンを使用してフィルタリングを継続
			} else {
				// サーバーAPIを呼び出し
				const result = await misskeyApi('notes/llm-filter', {
					text: note.text ?? '',
					noteId: note.id,
				});

				return saveToCache(note.id, {
					filtered: result.filtered,
					reason: result.reason ?? 'Server LLM API filtered this content',
					timestamp: Date.now(),
				});
			}
		} catch (error: any) {
			console.error('サーバーLLM APIエラー:', error);
			// geminiTokenがあればフォールバック
			if (!geminiToken) {
				return saveToCache(note.id, { filtered: false, reason: 'Server LLM API error', timestamp: Date.now() });
			}
		}
	}

	// ユーザー自身のAPIキーを使用する場合（サーバーAPIが使えない場合のフォールバックも含む）
	if (!geminiToken) {
		return saveToCache(note.id, { filtered: false, reason: 'No Gemini API token', timestamp: Date.now() });
	}

	try {
		// リクエストボディの作成
		const systemPrompt = `
あなたは投稿内容が不適切かどうかを判断するフィルターです。
以下の投稿内容を評価し、有害、攻撃的、不適切、または望ましくない内容であるかどうかを判断してください。
以下のJSONフォーマットで回答してください:
{
  "filtered": boolean, // trueなら不適切な内容、falseなら問題ない内容
  "reason": string // フィルタリングの理由（簡潔に）
}
`;

		const requestBody = {
			contents: [
				{
					role: 'model',
					parts: [{ text: systemPrompt }],
				},
				{
					role: 'user',
					parts: [{ text: note.text ?? '(テキストなし)' }],
				},
			],
			generationConfig: {
				temperature: 0.2,
				topP: 0.8,
				topK: 40,
			},
		};

		// Gemini APIにリクエスト送信
		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/${geminiModels}:generateContent?key=${geminiToken}`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(requestBody),
			},
		);

		if (!response.ok) {
			console.error(`Gemini API エラー: ${response.status} ${response.statusText}`);
			return saveToCache(note.id, { filtered: false, reason: `API error: ${response.status}`, timestamp: Date.now() });
		}

		const data = await response.json();

		if (!data.candidates || data.candidates.length === 0) {
			return saveToCache(note.id, { filtered: false, reason: 'No candidates returned from API', timestamp: Date.now() });
		}

		try {
			// JSON形式でレスポンスを取得
			const candidate = data.candidates[0];
			if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
				return saveToCache(note.id, { filtered: false, reason: 'Invalid response format', timestamp: Date.now() });
			}

			// テキストを取得
			const responseText = candidate.content.parts[0].text;

			// Markdownのコードブロックを処理（```json...```形式を除去）
			let jsonText = responseText;
			if (responseText.includes('```')) {
				const jsonMatch = responseText.match(/```(?:json)?\n([\s\S]*?)\n```/);
				if (jsonMatch && jsonMatch[1]) {
					jsonText = jsonMatch[1];
				}
			}

			// JSONパース
			const filterResult = JSON.parse(jsonText);

			return saveToCache(note.id, {
				filtered: filterResult.filtered === true,
				reason: filterResult.reason ?? 'Unspecified reason',
				timestamp: Date.now(),
			});
		} catch (error) {
			console.error('JSONパースエラー:', error);
			// JSON解析に失敗した場合はフィルタリングしない
			return saveToCache(note.id, { filtered: false, reason: 'Failed to parse filter result', timestamp: Date.now() });
		}
	} catch (error) {
		console.error('フィルタリングエラー:', error);
		return saveToCache(note.id, { filtered: false, reason: 'Error during filtering', timestamp: Date.now() });
	}
}

// キャッシュから取得
function getFromCache(noteId: string): FilterResult | null {
	const cached = filteredNoteCache.get(noteId);
	if (cached && Date.now() - cached.timestamp < cacheExpiryTime) {
		return cached;
	}
	return null;
}

// キャッシュに保存
function saveToCache(noteId: string, result: FilterResult): FilterResult {
	filteredNoteCache.set(noteId, result);

	// キャッシュが大きくなりすぎないように古いエントリを削除
	if (filteredNoteCache.size > 1000) {
		const oldestEntries = Array.from(filteredNoteCache.entries())
			.sort(([, a], [, b]) => a.timestamp - b.timestamp)
			.slice(0, 200);

		for (const [key] of oldestEntries) {
			filteredNoteCache.delete(key);
		}
	}

	return result;
}

// MkNote.vueで使用するためにノートのフィルタリング状態を確認
export async function checkNoteFiltered(note: Misskey.entities.Note): Promise<string | false> {
	try {
		// フィルター設定が有効でない場合はフィルタリングしない
		if (!prefer.s.useLlmContentFilter) {
			return false;
		}

		const result = await filterNoteContent(note);
		if (result.filtered) {
			return result.reason;
		}
		return false;
	} catch (error) {
		console.error('ノートフィルタリングエラー:', error);
		return false;
	}
}
