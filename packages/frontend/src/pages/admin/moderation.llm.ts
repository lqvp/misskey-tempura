/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type OpenLlmModerationVisibility = 'public' | 'public_non_ltl' | 'home' | 'followers' | 'specified';

// 未設定時のフォールバック先
export const defaultOpenLlmModerationApiUrl = 'https://api.openai.com/v1/moderations';
export const defaultOpenLlmModerationModel = 'omni-moderation-latest';

export const defaultOpenLlmModerationVisibilities = ['public', 'public_non_ltl', 'home', 'followers', 'specified'] as const satisfies readonly OpenLlmModerationVisibility[];

export function normalizeOpenLlmModerationVisibilities(value: unknown): OpenLlmModerationVisibility[] {
	if (!Array.isArray(value)) return [...defaultOpenLlmModerationVisibilities];

	const normalized = value.filter((visibility): visibility is OpenLlmModerationVisibility => {
		return typeof visibility === 'string' && defaultOpenLlmModerationVisibilities.includes(visibility as OpenLlmModerationVisibility);
	});

	return normalized;
}
