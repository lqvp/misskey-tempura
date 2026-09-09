/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent } from 'vue';
import { prefer } from '@/preferences.js';
import * as os from '@/os.js';
import { generateGeminiSummary, extractCandidateText } from '@/utility/tempura-script/llm.js';
import { displayLlmError } from '@/utils/errorHandler.js';
import { i18n } from '@/i18n.js';

/**
 * 指定されたテキストに対して、Gemini API による変換を実行します。
 * ユーザーは変換スタイル（geminiNoteLongText, geminiNoteShortText, etc.）を選択し、
 * 変換結果に対して「決定」「再生成」「キャンセル」を選べ、決定時は onApplied コールバックが呼ばれます。
 *
 * @param noteText 変換対象のテキスト
 * @param onApplied 変換結果を適用する際のコールバック（例：PostFormのテキスト置換）
 */
export async function transformTextWithGemini(noteText: string, onApplied: (newText: string) => void): Promise<void> {
	// 利用可能な変換スタイルの一覧
	const styles = [
		{ key: 'geminiNoteLongText', label: '長文' },
		{ key: 'geminiNoteShortText', label: '短文' },
		{ key: 'geminiNoteSimpleText', label: 'シンプル' },
		{ key: 'geminiNoteCasualText', label: 'カジュアル' },
		{ key: 'geminiNoteProfessionalText', label: 'プロフェッショナル' },
		{ key: 'geminiNoteCatText', label: '猫っぽく' },
		{ key: 'geminiNoteCustomText', label: 'カスタム' },
	];

	// 変換スタイルの選択（os.select を使用）
	const styleSelection = await os.select({
		title: '変換スタイルを選択してください',
		items: styles.map(style => ({ label: style.label, value: style.key })),
	});
	if (styleSelection.canceled) return;
	const selectedStyleKey = styleSelection.result!;

	// 繰り返し処理で「再生成」が選択された場合も対応
	while (true) {
		const state = (prefer.s as unknown) as Record<string, string> | null;
		const stylePrompt = state?.[selectedStyleKey] ?? '';

		let transformedText: string;
		try {
			const data = await generateGeminiSummary({
				userContent: noteText,
				systemInstruction: stylePrompt,
			});
			transformedText = extractCandidateText(data);
		} catch (error: any) {
			displayLlmError(error, i18n.ts._llm._error.transformExecute);
			return;
		}

		const dialogResult: string = await new Promise((resolve) => {
			let resolved = false;
			const safeResolve = (value: string) => {
				if (!resolved) {
					resolved = true;
					resolve(value);
				}
			};

			const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkDialog.vue')), {
				title: '変換結果',
				text: transformedText,
				actions: [
					{ text: '決定', primary: true, callback: () => { dispose(); safeResolve('confirm'); } },
					{ text: '再生成', callback: () => { dispose(); safeResolve('regenerate'); } },
					{ text: 'キャンセル', danger: true, callback: () => { dispose(); safeResolve('cancel'); } },
				],
			}, {
				closed: () => safeResolve('cancel'),
			});
		});

		if (dialogResult === 'confirm') {
			onApplied(transformedText);
			break;
		} else if (dialogResult === 'cancel') {
			break;
		}
	}
}
