/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const GLOBAL_SHORTCUT_PREFERENCE_KEYS = [
	'globalShortcutPost',
	'globalShortcutDarkModeToggle',
	'globalShortcutSearch',
	'globalShortcutSafeMode',
] as const;

export type GlobalShortcutPreferenceKey = typeof GLOBAL_SHORTCUT_PREFERENCE_KEYS[number];

export const isGlobalShortcutPreferenceKey = (key: string): key is GlobalShortcutPreferenceKey => {
	return (GLOBAL_SHORTCUT_PREFERENCE_KEYS as readonly string[]).includes(key);
};

export const normalizeGlobalShortcutPattern = (value: string | null | undefined) => {
	if (value == null) return null;
	const normalized = value.trim().toLowerCase();
	if (normalized === '' || normalized === 'none') return null;
	return normalized;
};
