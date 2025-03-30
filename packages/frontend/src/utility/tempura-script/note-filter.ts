/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { prefer } from '@/preferences.js';

// キャッシュの設定
const cacheExpiryTime = 1000 * 60 * 60 * 4; // 4時間キャッシュを保持
const MAX_CACHE_SIZE = 1000; // 最大キャッシュサイズ
const LRU_REMOVE_COUNT = 200; // LRUで一度に削除するエントリ数

// フィルタリング結果の型定義
export interface FilterResult {
	reason: string;
	score: number;
	error?: string;
	timestamp: number;
}

/**
 * キャッシュ管理クラス
 */
class FilterCache {
	// キャッシュのデータ構造
	private cache: Map<string, FilterResult>;
	private isDirty: boolean;
	private debounceTimer: ReturnType<typeof setTimeout> | null;

	// コンストラクタでデータを初期化
	constructor() {
		// キャッシュの初期化
		this.cache = new Map();
		this.isDirty = false;
		this.debounceTimer = null;

		// ストアからキャッシュデータをロード
		const storedCache = prefer.s.filterCache || {};
		Object.entries(storedCache).forEach(([key, value]) => {
			this.cache.set(key, value as FilterResult);
		});

		// ページアンロード時に未保存の変更を保存
		window.addEventListener('beforeunload', () => {
			this.saveNow();
		});
	}

	/**
	 * キャッシュからノートのフィルタリング結果を取得
	 */
	get(noteId: string): FilterResult | null {
		const entry = this.cache.get(noteId);
		if (!entry) return null;

		// 期限切れかチェック
		const now = Date.now();
		const isExpired = now - entry.timestamp > cacheExpiryTime;

		// 期限切れなら null を返す（実際の削除はクリーンアップ時に行う）
		return isExpired ? null : entry;
	}

	/**
	 * キャッシュにノートのフィルタリング結果を保存
	 */
	set(noteId: string, result: FilterResult): FilterResult {
		// タイムスタンプを更新して保存
		const entry = { ...result, timestamp: Date.now() };
		this.cache.set(noteId, entry);
		this.isDirty = true;

		// サイズ制限を超えていたらクリーンアップ
		if (this.cache.size > MAX_CACHE_SIZE) {
			this.cleanup();
		}

		// 変更をスケジュール
		this.scheduleCommit();
		return entry;
	}

	/**
	 * 古いキャッシュエントリをクリーンアップ
	 */
	cleanup(): void {
		const now = Date.now();
		let hasChanges = false;

		// 期限切れエントリの削除
		for (const [id, entry] of this.cache.entries()) {
			if (now - entry.timestamp > cacheExpiryTime) {
				this.cache.delete(id);
				hasChanges = true;
			}
		}

		// サイズ制限を超えている場合、古いエントリを削除
		if (this.cache.size > MAX_CACHE_SIZE) {
			const entries = [...this.cache.entries()]
				.sort(([, a], [, b]) => a.timestamp - b.timestamp);

			const toRemove = Math.min(LRU_REMOVE_COUNT, entries.length);
			for (let i = 0; i < toRemove; i++) {
				this.cache.delete(entries[i][0]);
				hasChanges = true;
			}
		}

		if (hasChanges) {
			this.isDirty = true;
			this.scheduleCommit();
		}
	}

	/**
	 * 全てのキャッシュをクリア
	 */
	cleanupAll(): void {
		this.cache.clear();
		this.isDirty = true;
		this.scheduleCommit();
	}

	/**
	 * 変更をスケジュール（デバウンス）
	 */
	private scheduleCommit(): void {
		if (!this.isDirty) return;

		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			this.saveNow();
			this.debounceTimer = null;
		}, 1000);
	}

	/**
	 * 変更を即座に保存
	 */
	saveNow(): void {
		if (!this.isDirty) return;

		const cacheObj: Record<string, FilterResult> = {};
		this.cache.forEach((value, key) => {
			cacheObj[key] = value;
		});

		prefer.commit('filterCache', cacheObj);
		this.isDirty = false;
	}
}

// シングルトンインスタンス
const filterCache = new FilterCache();

// キャッシュから取得するユーティリティ関数
function getFromCache(noteId: string): FilterResult | null {
	return filterCache.get(noteId);
}

// キャッシュに保存するユーティリティ関数
function saveToCache(noteId: string, result: FilterResult): FilterResult {
	return filterCache.set(noteId, result);
}

/**
 * キャッシュをクリアするユーティリティ関数
 */
export function clearAllFilterCache(): void {
	filterCache.cleanupAll();
}

/**
 * Gemini APIを使ってノート内容をフィルタリングします
 *
 * @param note フィルタリングするノート
 * @returns フィルタリング結果（score: 0.0-1.0のスコア値, reason: 理由）
 */
export async function filterNoteContent(note: Misskey.entities.Note): Promise<FilterResult> {
	// 設定が無効になっている場合はフィルタリングしない
	if (!prefer.s.useLlmContentFilter) {
		return { reason: 'Content filter is disabled', timestamp: Date.now(), score: 0 };
	}

	// キャッシュチェック
	const cachedResult = getFromCache(note.id);
	if (cachedResult) {
		// キャッシュヒット時にタイムスタンプを更新（LRUの実装）
		cachedResult.timestamp = Date.now();
		saveToCache(note.id, cachedResult);
		return cachedResult;
	}

	// テキストが空の場合はフィルタリングしない
	if (!note.text && (!note.files || note.files.length === 0)) {
		return saveToCache(note.id, { reason: 'No content to filter', timestamp: Date.now(), score: 0 });
	}

	const { geminiToken, geminiModels } = prefer.s;

	// ユーザー自身のAPIキーを使用する場合
	if (!geminiToken) {
		return saveToCache(note.id, {
			reason: 'No Gemini API token',
			timestamp: Date.now(),
			score: 0,
		});
	}

	try {
		// リクエストボディの作成
		const systemPrompt = `
あなたは、ソーシャルメディアプラットフォームの一般ユーザー向けコンテンツモデレーションAIです。投稿内容がプラットフォームにふさわしくないか、または望ましくない内容であるかを判断する役割を担います。

以下の投稿内容を評価し、有害、攻撃的、差別的、不適切、または望ましくない内容であるかを判断してください。

具体的な例:
*   他のユーザーを不快にさせる可能性のある表現
*   暴力的、または性的な内容を示唆する表現
*   個人情報やプライバシーに関わる情報
*   違法行為を助長するような内容
*   スパムや広告のような内容
*   デマや誤解を招く情報
*   特定の商品やサービスを過度に宣伝する内容

評価基準は以下の通りです。

*   0.0〜0.3: 問題なし。
*   0.3〜0.4: 軽度の懸念。注意が必要ですが、削除するほどではありません。
*   0.4〜0.7: 中程度の懸念。投稿は不適切と判断される可能性があります。
*   0.7〜0.9: 重大な懸念。
*   0.9〜1.0: 非常に問題のある内容。

以下のJSON形式で出力してください。
{
  "reason": string, // 評価の理由（簡潔に記述）
  "score": number  // 0.0〜1.0の範囲で不適切さのスコア（1.0が最も不適切）
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
		const response = await window.fetch(
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
			const errorText = `Gemini API エラー: ${response.status} ${response.statusText}`;
			console.error(errorText);

			// エラーレスポンスの場合はキャッシュに保存せずに結果を返す
			return {
				reason: `API error: ${response.status}`,
				timestamp: Date.now(),
				score: 0,
				error: errorText,
			};
		}

		const data = await response.json();

		if (!data.candidates || data.candidates.length === 0) {
			return saveToCache(note.id, {
				reason: 'No candidates returned from API',
				timestamp: Date.now(),
				score: 0,
				error: 'No candidates returned from API',
			});
		}

		try {
			// JSON形式でレスポンスを取得
			const candidate = data.candidates[0];
			if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
				return saveToCache(note.id, {
					reason: 'Invalid response format',
					timestamp: Date.now(),
					score: 0,
					error: 'Invalid response format from API',
				});
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
			const score = typeof filterResult.score === 'number' ?
				Math.max(0, Math.min(1, filterResult.score)) : // 0〜1の範囲に制限
				0.4; // スコアが提供されていない場合のデフォルト値

			return saveToCache(note.id, {
				reason: filterResult.reason ?? 'Unspecified reason',
				timestamp: Date.now(),
				score: score,
			});
		} catch (error) {
			console.error('JSONパースエラー:', error);
			// JSON解析に失敗した場合はフィルタリングしない
			return saveToCache(note.id, {
				reason: 'Failed to parse filter result',
				timestamp: Date.now(),
				score: 0,
				error: error instanceof Error ? error.message : 'JSON parse error',
			});
		}
	} catch (error) {
		console.error('フィルタリングエラー:', error);
		return saveToCache(note.id, {
			reason: 'Error during filtering',
			timestamp: Date.now(),
			score: 0,
			error: error instanceof Error ? error.message : 'Unknown error during filtering',
		});
	}
}

// MkNote.vueで使用するためにノートのフィルタリングスコアを確認
export async function checkNoteFiltered(note: Misskey.entities.Note): Promise<false | { reason: string, score: number, error?: string }> {
	try {
		// フィルター設定が有効でない場合はフィルタリングしない
		if (!prefer.s.useLlmContentFilter) {
			return false;
		}

		const result = await filterNoteContent(note);
		return {
			reason: result.reason,
			score: result.score,
			error: result.error,
		};
	} catch (error) {
		console.error('ノートフィルタリングエラー:', error);
		return {
			reason: 'エラーが発生しました',
			score: 0,
			error: error instanceof Error ? error.message : 'Unknown error in checkNoteFiltered',
		};
	}
}
