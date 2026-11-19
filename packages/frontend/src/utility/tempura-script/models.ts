/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * モデル一覧の静的フォールバック。
 * 実際の一覧は fetchAvailableModels() (llm.ts) で各 API から動的取得するため、
 * モデル一覧 API に到達できない場合のフォールバックとして使われる。
 */
export const openaiModels = [
	'gpt-4o-mini',
	'gpt-4o',
	'gpt-4.1-mini',
	'gpt-4.1',
];
