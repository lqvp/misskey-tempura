/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { generateGeminiSummary } from '@/scripts/temp-script/llm';
import { defaultStore } from '@/store.js';

export async function callGeminiSummarize(text: string): Promise<string> {
	// geminiPrompt を先頭に付与してプロンプト生成
	const prompt = (defaultStore.state.geminiPrompt ?? '') + 'note: ' + text;

	const data = await generateGeminiSummary(prompt);
	if (!data.candidates || data.candidates.length === 0) {
		throw new Error('No candidates returned from Gemini API.');
	}
	const candidate = data.candidates[0];
	if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
		throw new Error('Invalid candidate format from Gemini API.');
	}
	return candidate.content.parts[0].text;
}

export async function summarizeNoteText(noteText: string): Promise<string> {
	try {
		const summary = await callGeminiSummarize(noteText);
		return summary;
	} catch (error) {
		console.error('Summarization error:', error);
		throw error;
	}
}
