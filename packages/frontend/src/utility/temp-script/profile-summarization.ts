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
	id: string;
	text: string | null;
	visibility: 'public' | 'home' | 'followers' | 'specified';
}

/**
 * API リクエストパラメータの型定義
 */
interface NotesRequestParams {
	userId: string;
	withRenotes: boolean;
	withReplies: boolean;
	withChannelNotes: boolean;
	withFiles: boolean;
	limit: number;
	allowPartial: boolean;
	untilId?: string;
}

const MAX_API_NOTES_PER_REQUEST = 100;

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

		// 実際に取得するノート数を決定（デフォルト: 15）
		const limit = notesLimit ?? 15;

		// 取得したノートを格納する配列
		let allNotes: NoteItem[] = [];
		let untilId: string | undefined = undefined;

		// 最大で指定された数のノートを取得（100ノートごとにページネーション）
		while (allNotes.length < limit) {
			// 現在のページで取得するノート数を計算
			const remainingToFetch = limit - allNotes.length;
			const currentLimit = Math.min(remainingToFetch, MAX_API_NOTES_PER_REQUEST);

			// ノートの取得リクエスト
			const requestParams: NotesRequestParams = {
				userId,
				withRenotes: false,
				withReplies: false,
				withChannelNotes: false,
				withFiles: false,
				limit: currentLimit,
				allowPartial: false,
			};

			// untilIdがある場合はそれを含める
			if (untilId) {
				requestParams.untilId = untilId;
			}

			// ノートを取得
			const notesResponse = await misskeyApi('users/notes', requestParams);

			// APIからの応答が配列でない場合、またはデータが空の場合はループを終了
			if (!Array.isArray(notesResponse) || notesResponse.length === 0) {
				break;
			}

			// 取得したノートを追加
			allNotes = allNotes.concat(notesResponse);

			// 最後のノートのIDを次のページのuntilIdとして保存
			untilId = notesResponse[notesResponse.length - 1].id;

			// 取得したノート数が要求数より少ない場合（これ以上ノートがない）は終了
			if (notesResponse.length < currentLimit) {
				break;
			}
		}

		// visibilityがpublicまたはhomeのノートのみをフィルタリング
		const filteredNotes = allNotes.filter(
			(note: NoteItem) => note.visibility === 'public' || note.visibility === 'home',
		);

		// nullでないテキストのみを抽出
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
