/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent } from 'vue';
import { generateGeminiSummary } from '@/scripts/temp-script/llm.js';
import { defaultStore } from '@/store.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { displayLlmError } from '@/utils/errorHandler.js';

/**
 * Gemini を用いてノートの要約を生成します。
 *
 * @param text 要約対象のノート本文
 * @returns 要約されたテキスト
 */
export async function callGeminiSummarize(text: string): Promise<string> {
	const systemInstruction = [
		defaultStore.state.geminiPromptNote ?? '',
		defaultStore.state.geminiSystemPrompt ?? '',
	].join('\n');

	const data = await generateGeminiSummary({
		userContent: text,
		systemInstruction,
	});
	if (!data.candidates || data.candidates.length === 0) {
		displayLlmError(new Error('No candidates returned from Gemini API.'));
	}
	const candidate = data.candidates[0];
	if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
		displayLlmError(new Error('Invalid candidate format from Gemini API.'));
	}
	return candidate.content.parts[0].text;
}

export async function summarizeNoteText(noteText: string): Promise<string> {
	try {
		const summary = await callGeminiSummarize(noteText);
		return summary;
	} catch (error: any) {
		console.error('Summarization error:', error);
		displayLlmError(error, 'ノートの要約に失敗しました。');
	}
}

export async function showNoteSummary(noteText: string): Promise<void> {
	if (!noteText) {
		displayLlmError(new Error('ノート本文がありません。'));
	}
	try {
		const summary = await summarizeNoteText(noteText);
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
