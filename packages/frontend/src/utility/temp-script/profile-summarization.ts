/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent, ref } from 'vue';
import * as os from '@/os.js';
import { generateGeminiSummary, extractCandidateText } from '@/utility/temp-script/llm.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { store } from '@/store.js';
import { prefer } from '@/preferences.js';
import { displayLlmError } from '@/utils/errorHandler.js';
import { i18n } from '@/i18n.js';

/**
 * ノートの基本構造を定義するインターフェース
 */
interface NoteItem {
	text: string | null;
	visibility: 'public' | 'home' | 'followers' | 'specified';
}

/**
 * 指定したユーザーIDのプロフィール情報と最新のノートを取得し、LLMに要約させた結果を表示します。
 *
 * @param userId 要約対象のユーザーID
 * @param notesLimit 取得するノートの最大数（デフォルト: 15）
 */
export async function summarizeUserProfile(userId: string, notesLimit?: number): Promise<void> {
	const waitingFlag = ref(true);
	const waitingPopup = os.popup(defineAsyncComponent(() => import('@/components/MkWaitingDialog.vue')), {
		success: false,
		showing: waitingFlag,
	}, {
		closed: () => { /* ... */ },
	});
	try {
		// プロフィール情報を取得 (name, location, description)
		const profile = await misskeyApi('users/show', { userId });
		if (!profile) {
			displayLlmError(new Error(i18n.ts._llm._error.profileNotFound));
		}
		const { name, location, description } = profile;

		// 最新のノートを取得 (テキストのみを抽出)
		const notesResponse = await misskeyApi('users/notes', {
			userId,
			withRenotes: false,
			withReplies: false,
			withChannelNotes: false,
			withFiles: false,
			limit: notesLimit ?? 15,
			allowPartial: false,
		});

		// visibilityがpublicまたはhomeのノートのみをフィルタリング
		const filteredNotes = Array.isArray(notesResponse)
			? notesResponse.filter((note: NoteItem) => note.visibility === 'public' || note.visibility === 'home')
			: [];

		const notesTexts: string[] = filteredNotes
			.map((note: NoteItem) => note.text)
			.filter((text): text is string => text !== null);

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
		let summarizedText: string;
		try {
			summarizedText = extractCandidateText(summaryResult);
		} catch (error: unknown) {
			displayLlmError(error as Error, i18n.ts._llm._error.responseFormat);
		}
		os.alert({ type: 'info', text: summarizedText });
	} catch (error: unknown) {
		// catch節内も統一してハンドリング（この呼び出しによりalertとthrowが行われる）
		displayLlmError(error as Error, i18n.ts._llm._error.profileSummarization);
	} finally {
		waitingFlag.value = false;
		waitingPopup.dispose();
	}
}
