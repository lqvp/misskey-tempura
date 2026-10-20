/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

function isMutedUser(value: Record<string, unknown>, mutedUserIds: ReadonlySet<string>): boolean {
	// UserLite/UserDetailed-like objects always have `id`, `username`, `avatarUrl` and `avatarDecorations`.
	return typeof value.id === 'string' &&
		typeof value.username === 'string' &&
		typeof value.avatarUrl === 'string' &&
		Array.isArray(value.avatarDecorations) &&
		mutedUserIds.has(value.id);
}

/**
 * ミュートしたユーザーのアバターデコレーションを外して JSON にする。
 *
 * ストリーミングの payload は全接続で同じオブジェクトを共有しているので、書き換えずに書き出すときだけ外す。
 */
export function stringifyWithAvatarDecorationMuting(value: unknown, mutedUserIds: ReadonlySet<string>): string {
	if (mutedUserIds.size === 0) return JSON.stringify(value);

	return JSON.stringify(value, (_key, current: unknown) => {
		if (current != null && typeof current === 'object' && !Array.isArray(current) && isMutedUser(current as Record<string, unknown>, mutedUserIds)) {
			return { ...current, avatarDecorations: [] };
		}
		return current;
	});
}
