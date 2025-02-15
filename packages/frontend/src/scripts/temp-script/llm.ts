/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defaultStore } from '@/store.js';

export async function generateGeminiSummary(prompt: string): Promise<any> {
	const { geminiToken, geminiModels } = defaultStore.state;
	if (!geminiToken) {
		throw new Error('Gemini API tokenがありません。');
	}

	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${geminiModels}:generateContent?key=${geminiToken}`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				contents: [
					{
						parts: [{ text: prompt }],
					},
				],
			}),
		},
	);

	if (!response.ok) {
		throw new Error('Failed to get summary from Gemini API.');
	}
	return response.json();
}
