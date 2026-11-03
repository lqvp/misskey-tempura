/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { miLocalStorage } from '@/local-storage.js';
import { migrateDraftKeys } from '@/utility/draft-keys.js';
import { withPreferenceLock } from '@/preferences/lock.js';

type Collection = 'drafts' | 'chatMessageDrafts';
const storageKey = (collection: Collection, key: string): `draft-item:${string}` => `draft-item:${collection}:${key}`;

// One synchronous write per draft. Different accounts/targets cannot overwrite
// each other's whole collection, including during page unload.
export function saveDraftItem(collection: Collection, key: string, value: unknown): void {
	miLocalStorage.setItem(storageKey(collection, key), JSON.stringify(value));
}

export function readDraftItem<T>(collection: Collection, key: string): T | undefined {
	const raw = miLocalStorage.getItem(storageKey(collection, key));
	return raw == null ? undefined : JSON.parse(raw);
}

export function deleteDraftItem(collection: Collection, key: string): void {
	miLocalStorage.removeItem(storageKey(collection, key));
}

export async function migrateDraftItems(accountIds: string[]): Promise<void> {
	await withPreferenceLock(() => {
		if (miLocalStorage.getItem('draftItemsMigrated') != null) return;
		for (const collection of ['drafts', 'chatMessageDrafts'] as const) {
			const raw = miLocalStorage.getItem(collection);
			if (raw == null) continue;
			try {
				const drafts = migrateDraftKeys(JSON.parse(raw), accountIds);
				for (const [key, value] of Object.entries(drafts)) {
					if (!key.includes('::')) continue;
					if (miLocalStorage.getItem(storageKey(collection, key)) == null) saveDraftItem(collection, key, value);
				}
			} catch { /* Keep malformed legacy data untouched. */ }
		}
		// Keep the original collections for recovery, but never reread after
		// migration: deleted new drafts must not reappear from the old snapshot.
		miLocalStorage.setItem('draftItemsMigrated', '1');
	});
}
