/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 下書き(drafts / chatMessageDrafts)のキーにアカウントIDを付ける。
// アカウントIDが無いキー(返信・引用・チャンネル・チャット)は、別アカウントのタブで同じ下書きを開いてしまうため。

const SCOPE_SEPARATOR = '::';

export function scopedDraftKey(userId: string, key: string): string {
	return userId + SCOPE_SEPARATOR + key;
}

function isScoped(key: string): boolean {
	return key.includes(SCOPE_SEPARATOR);
}

/**
 * 古いキー(アカウントID無し)を新しいキーへ付け替えた結果を返す。古いキーは削除しない。
 * - `note:<userId>` を含むキーは持ち主が分かるので、その userId のキーへ。
 * - それ以外は、端末の保存済みアカウントが1つだけならそのアカウントへ。2つ以上なら持ち主が不明なので触らない。
 * - 新しいキーが既にあれば上書きしない。何度実行しても同じ結果になる。
 */
export function migrateDraftKeys<T>(drafts: Record<string, T>, accountIds: string[]): Record<string, T> {
	const result: Record<string, T> = { ...drafts };
	for (const [key, value] of Object.entries(drafts)) {
		if (isScoped(key)) continue;
		const noted = key.includes('renote:') ? null : /^(?:channel:[A-Za-z0-9]+)?note:([A-Za-z0-9]+)$/.exec(key);
		const owner = noted ? noted[1] : (accountIds.length === 1 ? accountIds[0] : null);
		if (owner == null) continue;
		const next = scopedDraftKey(owner, key);
		if (!(next in result)) result[next] = value;
	}
	return result;
}
