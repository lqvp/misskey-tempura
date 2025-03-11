/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent } from 'vue';
import * as Misskey from 'misskey-js';
import { generateGeminiSummary } from '@/scripts/temp-script/llm.js';
import { defaultStore } from '@/store.js';
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
		defaultStore.state.geminiPromptNote ?? '',
		defaultStore.state.geminiSystemPrompt ?? '',
	].join('\n');

	const data = await generateGeminiSummary({
		note: note,
		systemInstruction,
	});

	if (!data.candidates || data.candidates.length === 0) {
		displayLlmError(new Error('Gemini APIから返された候補はありません。'));
	}
	const candidate = data.candidates[0];
	if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
		displayLlmError(new Error('Gemini APIからの候補フォーマットが無効です。'));
	}
	return candidate.content.parts[0].text;
}

export async function summarizeNote(note: Misskey.entities.Note): Promise<string> {
	try {
		const summary = await callGeminiSummarize(note);
		return summary;
	} catch (error: any) {
		console.error('Summarization error:', error);
		displayLlmError(error, 'ノートの要約に失敗しました。');
	}
}

// 後方互換性のためのラッパー関数
export async function summarizeNoteText(noteText: string): Promise<string> {
	return summarizeNote({ text: noteText } as Misskey.entities.Note);
}

export async function showNoteSummary(noteOrText: Misskey.entities.Note | string): Promise<void> {
	try {
		let summary: string;

		if (typeof noteOrText === 'string') {
			if (!noteOrText) {
				displayLlmError(new Error('ノート本文がありません。'));
				return;
			}
			summary = await summarizeNoteText(noteOrText);
		} else {
			if (!noteOrText.text && (!noteOrText.files || noteOrText.files.length === 0)) {
				displayLlmError(new Error('ノート本文とファイルがありません。'));
				return;
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
		displayLlmError(error, '要約の取得に失敗しました。');
	}
}
