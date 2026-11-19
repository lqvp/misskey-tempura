/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { generateLLMResponse } from '@/utility/tempura-script/llm.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { extractLLMText } from '@/utility/tempura-script/llm-response.js';
import { store } from '@/store.js';
import { prefer } from '@/preferences.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { displayLlmError } from '@/utils/errorHandler.js';

/**
 * 返信元ノートの文脈を遡って取得する (最大5件、参考データとして付与する)
 */
async function fetchAncestorContext(note: Misskey.entities.Note): Promise<string> {
	const ancestors: string[] = [];
	let cursor: string | null | undefined = note.replyId;
	for (let i = 0; i < 5 && cursor != null; i++) {
		try {
			const parent = await misskeyApi('notes/show', { noteId: cursor });
			// 本文がないノート (画像のみ等) は追加しないが、探索は続行する
			if (parent.text != null && parent.text !== '') {
				ancestors.unshift(parent.text);
			}
			cursor = parent.replyId ?? null;
		} catch {
			break;
		}
	}
	return ancestors.join('\n\n');
}

/**
 * LLM を用いてノートの要約を生成します。
 */
export async function callLLMSummarize(note: Misskey.entities.Note): Promise<string> {
	const systemInstruction = [
		prefer.s.geminiPromptNote ?? '',
		prefer.s.geminiSystemPrompt ?? '',
	].join('\n');

	// 返信文脈があれば参考データとして先頭に付与する (要約対象は最後の投稿)
	const ancestorContext = note.replyId != null ? await fetchAncestorContext(note) : '';
	const userContent = [
		ancestorContext !== '' ? `会話の文脈 (参考データ。要約対象ではない):\n${ancestorContext}` : '',
		`要約対象の投稿:\n${note.text ?? ''}`,
	].filter((x) => x !== '').join('\n\n');

	const data = await generateLLMResponse({
		note: note,
		userContent,
		systemInstruction,
	});
	try {
		return extractLLMText(data);
	} catch (error: any) {
		displayLlmError(error, i18n.ts._llm._error.responseParse);
	}
}

export async function summarizeNote(note: Misskey.entities.Note): Promise<string> {
	try {
		const summary = await callLLMSummarize(note);
		return summary;
	} catch (error: any) {
		console.error('Summarization error:', error);
		displayLlmError(error, i18n.ts._llm._error.noteSummarization);
	}
}

// 後方互換性のためのラッパー関数
export async function summarizeNoteText(noteText: string): Promise<string> {
	return summarizeNote({ text: noteText } as Misskey.entities.Note);
}

export async function showNoteSummary(noteOrText: Misskey.entities.Note | string): Promise<void> {
	// 以下、読み込み中表示の追加
	const waitingFlag = ref(true);
	const waitingPopup = os.popup(defineAsyncComponent(() => import('@/components/MkWaitingDialog.vue')), {
		success: false,
		showing: waitingFlag,
	}, {
		closed: () => { /* ... */ },
	});
	try {
		let summary: string;
		if (typeof noteOrText === 'string') {
			if (!noteOrText) {
				displayLlmError(new Error(i18n.ts._llm._error.noteEmpty));
			}
			summary = await summarizeNoteText(noteOrText);
		} else {
			if (!noteOrText.text && (!noteOrText.files || noteOrText.files.length === 0)) {
				displayLlmError(new Error(i18n.ts._llm._error.noteMissing));
			}
			summary = await summarizeNote(noteOrText);
		}
		if (!summary) return;

		os.popup(defineAsyncComponent(() => import('@/components/MkDialog.vue')), {
			title: i18n.ts._llm.summarizeNote,
			text: summary,
		});
	} catch (error: any) {
		console.error('Summarization failed:', error);
		displayLlmError(error, i18n.ts._llm._error.noteSummaryFetch);
	} finally {
		waitingFlag.value = false;
		waitingPopup.dispose();
	}
}
