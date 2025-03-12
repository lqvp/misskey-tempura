/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { store } from '@/store.js';
import { prefer } from '@/preferences.js';
import * as os from '@/os.js';
import { generateGeminiSummary } from '@/utility/temp-script/llm.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { displayLlmError } from '@/utils/errorHandler.js';

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
			displayLlmError(new Error('プロフィール情報が取得できませんでした。'));
		}
		const { name, location, description } = profile;

		// 最新のノートを取得 (テキストのみを抽出)
		const notesResponse = await misskeyApi('users/notes', {
			userId,
			withRenotes: false,
			withReplies: false,
			withChannelNotes: false,
			withFiles: false,
			limit: 15,
			allowPartial: false,
		});
		const notesTexts: string[] = Array.isArray(notesResponse)
			? notesResponse.map((note: any) => note.text).filter(Boolean)
			: [];

		// Gemini API 呼び出しをシステム命令形式に更新
		const systemInstruction = [
			prefer.s.geminiPromptProfile ?? '',
			prefer.s.geminiSystemPrompt ?? '',
		].join('\n');

		const userContent =
			'プロフィール情報:\n' +
			`名前: ${name}\n` +
			`場所: ${location}\n` +
			`自己紹介: ${description}\n\n` +
			'投稿:\n' + notesTexts.join('\n');

		const summaryResult = await generateGeminiSummary({
			userContent,
			systemInstruction,
		});

		if (!summaryResult.candidates || summaryResult.candidates.length === 0) {
			displayLlmError(new Error('Gemini API からの候補がありません。'));
		}
		const candidate = summaryResult.candidates[0];
		if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
			displayLlmError(new Error('Gemini API のレスポンスフォーマットが不正です。'));
		}
		const summarizedText = candidate.content.parts[0].text;

		os.alert({ type: 'info', text: summarizedText });
	} catch (error: any) {
		// catch節内も統一してハンドリング（この呼び出しによりalertとthrowが行われる）
		displayLlmError(error, 'プロフィール要約の取得に失敗しました。');
	}
}
