/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { generateGeminiSummary, extractCandidateText } from '@/utility/temp-script/llm.js';
import { store } from '@/store.js';
import { prefer } from '@/preferences.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { displayLlmError } from '@/utils/errorHandler.js';

/**
 * Gemini を用いてノートの要約を生成します。
 *
 * @param note 要約対象のノート
 * @returns 要約されたテキスト
 */
export async function callGeminiSummarize(note: Misskey.entities.Note): Promise<string> {
	const systemInstruction = [
		prefer.s.geminiPromptNote ?? '',
		prefer.s.geminiSystemPrompt ?? '',
	].join('\n');

	const data = await generateGeminiSummary({
		note: note,
		systemInstruction,
	});
	try {
		return extractCandidateText(data);
	} catch (error: any) {
		displayLlmError(error, i18n.ts._llm._error.responseParse);
	}
}

export async function summarizeNote(note: Misskey.entities.Note): Promise<string> {
	try {
		const summary = await callGeminiSummarize(note);
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
