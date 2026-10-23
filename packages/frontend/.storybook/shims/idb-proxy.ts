/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Storybook shim for src/utility/idb-proxy.ts — identical except that the
// top-level `await iset('idb-test', 'test')` probe is fired without await.
// That top-level await makes rolldown emit invalid chunk code for the static
// Storybook build (a non-async module wrapper that still contains `await`),
// breaking every story at runtime with "SyntaxError: Unexpected reserved word".
// In Storybook the IndexedDB availability probe does not need to block module
// evaluation. Keep in sync with src/utility/idb-proxy.ts.

// FirefoxのプライベートモードなどではindexedDBが使用不可能なので、
// indexedDBが使えない環境ではlocalStorageを使う
import {
	get as iget,
	set as iset,
	del as idel,
	clear as iclear,
} from 'idb-keyval';
import { miLocalStorage } from '@/local-storage.js';

const PREFIX = 'idbfallback::';

let idbAvailable = typeof window !== 'undefined' ? !!(window.indexedDB && typeof window.indexedDB.open === 'function') : true;

if (idbAvailable) {
	iset('idb-test', 'test')
		.catch(err => {
			console.error('idb error', err);
			console.error('indexedDB is unavailable. It will use localStorage.');
			idbAvailable = false;
		});
} else {
	console.error('indexedDB is unavailable. It will use localStorage.');
}

export async function get(key: string) {
	if (idbAvailable) return iget(key);
	return miLocalStorage.getItemAsJson(`${PREFIX}${key}`);
}

export async function set(key: string, val: any) {
	if (idbAvailable) return iset(key, val);
	return miLocalStorage.setItemAsJson(`${PREFIX}${key}`, val);
}

export async function del(key: string) {
	if (idbAvailable) return idel(key);
	return miLocalStorage.removeItem(`${PREFIX}${key}`);
}

export async function clear() {
	if (idbAvailable) return iclear();
}
