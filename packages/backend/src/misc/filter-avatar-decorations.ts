/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isImportedAvatarDecoration } from '@/core/AvatarDecorationService.js';
import type { MiAvatarDecoration } from '@/models/AvatarDecoration.js';

export type AvatarDecorationOrigin = 'local' | 'remote' | 'combined';

type FilterableDecoration = Pick<MiAvatarDecoration, 'name' | 'description' | 'category'>;

/**
 * 管理画面向けにデコレーションを絞り込み、ローカル優先・名前順に並べた新しい配列を返す。
 * query は名前・説明・カテゴリに対する大文字小文字を区別しない部分一致。空文字なら絞り込まない。
 */
export function filterAvatarDecorations<T extends FilterableDecoration>(
	decorations: readonly T[],
	opts: { query: string; origin: AvatarDecorationOrigin },
): T[] {
	const query = opts.query.toLowerCase();

	const filtered = decorations.filter(decoration => {
		const isRemote = isImportedAvatarDecoration(decoration);
		if (opts.origin === 'local' && isRemote) return false;
		if (opts.origin === 'remote' && !isRemote) return false;
		if (query === '') return true;

		return decoration.name.toLowerCase().includes(query) ||
			decoration.description.toLowerCase().includes(query) ||
			(decoration.category?.toLowerCase().includes(query) ?? false);
	});

	// ユーザー側の search-avatar-decorations と同じく、ローカルを優先して名前順に並べる
	return filtered.sort((a, b) => {
		const aIsRemote = isImportedAvatarDecoration(a);
		const bIsRemote = isImportedAvatarDecoration(b);
		if (aIsRemote !== bIsRemote) return aIsRemote ? 1 : -1;
		return a.name.localeCompare(b.name);
	});
}
