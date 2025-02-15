/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defaultStore } from '@/store.js';
import * as os from '@/os.js';
import { generateGeminiSummary } from '@/scripts/temp-script/llm.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/scripts/misskey-api.js';

/**
 * 指定したユーザーIDのプロフィール情報と最新のノートを取得し、LLMに要約させた結果を表示します。
 *
 * @param userId 要約対象のユーザーID
 */
export async function summarizeUserProfile(userId: string): Promise<void> {
	try {
		// プロフィール情報を取得 (name, location, description)
		const profile = await misskeyApi('users/show', { userId });
		if (!profile) {
			os.alert({ type: 'error', text: 'プロフィール情報が取得できませんでした。' });
			return;
		}
		const { name, location, description } = profile;

		// 最新のノートを取得 (テキストのみを抽出)
		const notesResponse = await misskeyApi('users/notes', {
			userId,
			withRenotes: false,
			withReplies: false,
			withChannelNotes: false,
			withFiles: false,
			limit: 3,
			allowPartial: false,
		});
		const notesTexts: string[] = Array.isArray(notesResponse)
			? notesResponse.map((note: any) => note.text).filter(Boolean)
			: [];

		// ストアの専用プロンプトを先頭に付与してプロンプトを構築
		const prompt = (defaultStore.state.geminiPromptProfile ?? '') +
            'プロフィール情報:\n' +
            `名前: ${name}\n` +
            `場所: ${location}\n` +
            `自己紹介: ${description}\n\n` +
          	 '投稿:\n' +
            notesTexts.join('\n');

		// Gemini API を利用して要約を生成
		const summaryResult = await generateGeminiSummary(prompt);
		if (!summaryResult.candidates || summaryResult.candidates.length === 0) {
			throw new Error('Gemini API からの候補がありません。');
		}
		const candidate = summaryResult.candidates[0];
		if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
			throw new Error('Gemini API のレスポンスフォーマットが不正です。');
		}
		const summarizedText = candidate.content.parts[0].text;

		os.alert({ type: 'info', text: summarizedText });
	} catch (error) {
		console.error('プロフィール要約エラー:', error);
		os.alert({ type: 'error', text: 'プロフィール要約の取得に失敗しました。' });
	}
}
