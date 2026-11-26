/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { GeneratedSearchIndexItem } from 'search-index';

export type SearchIndexItem = {
	id: string;
	parentId?: string;
	path?: string;
	label: string;
	keywords: string[];
	texts: string[];
	icon?: string;
};

export function genSearchIndexes(generated: GeneratedSearchIndexItem[]): SearchIndexItem[] {
	const rootMods = new Map(generated.map(item => [item.id, item]));

	// link inlining here
	for (const item of generated) {
		if (item.inlining) {
			for (const id of item.inlining) {
				const inline = rootMods.get(id);
				if (inline) {
					inline.parentId = item.id;
					inline.path = item.path;
				} else {
					console.log('[Settings Search Index] Failed to inline', id);
				}
			}
		}
	}

	return generated;
}

export function excludeSearchIndexByPath(items: SearchIndexItem[], excludedPaths: readonly string[]): SearchIndexItem[] {
	if (excludedPaths.length === 0) return items;
	const excludedSet = new Set(excludedPaths);
	const byId = new Map(items.map(item => [item.id, item]));

	const isExcluded = (item: SearchIndexItem): boolean => {
		const visited = new Set<string>();
		let current: SearchIndexItem | undefined = item;
		while (current != null) {
			if (current.path != null && excludedSet.has(current.path)) {
				return true;
			}
			if (current.parentId == null || visited.has(current.id)) {
				return false;
			}
			visited.add(current.id);
			current = byId.get(current.parentId);
		}
		return false;
	};

	return items.filter(item => !isExcluded(item));
}
