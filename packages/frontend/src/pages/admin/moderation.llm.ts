/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';

export const defaultOpenLlmModerationVisibilities = ['public', 'public_non_ltl', 'home', 'followers', 'specified'] as const satisfies readonly (typeof Misskey.noteVisibilities)[number][];

export function normalizeOpenLlmModerationVisibilities(value: unknown): (typeof Misskey.noteVisibilities)[number][] {
	if (!Array.isArray(value)) return [...defaultOpenLlmModerationVisibilities];

	const normalized = value.filter((visibility): visibility is (typeof Misskey.noteVisibilities)[number] => {
		return typeof visibility === 'string' && defaultOpenLlmModerationVisibilities.includes(visibility as (typeof Misskey.noteVisibilities)[number]);
	});

	return normalized.length > 0 ? normalized : [...defaultOpenLlmModerationVisibilities];
}
