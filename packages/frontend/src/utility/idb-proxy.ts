/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// FirefoxのプライベートモードなどではindexedDBが使用不可能なので、
// indexedDBが使えない環境ではlocalStorageを使う
import {
	get as iget,
	update as iupdate,
	set as iset,
	del as idel,
	createStore,
} from 'idb-keyval';
import { miLocalStorage } from '@/local-storage.js';

const PREFIX = 'idbfallback::';

let idbAvailable = typeof window !== 'undefined' ? !!(window.indexedDB && typeof window.indexedDB.open === 'function') : true;

if (idbAvailable) {
	await Promise.race([iset('idb-test', 'test'), new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('IndexedDB initialization timed out')), 5000))])
		.catch(err => {
			console.error('idb error', err);
			console.error('indexedDB is unavailable. It will use localStorage.');
			idbAvailable = false;
		});
} else {
	console.error('indexedDB is unavailable. It will use localStorage.');
}

// Clearing credentials and advancing the generation are one transaction.
// Any writer from a tab opened before logout checks it inside its own write
// transaction, so a delayed add/refresh cannot recreate credentials afterward.
const generationKey = 'tab-account-generation';
const sessionGeneration = idbAvailable ? await iget(generationKey) : undefined;
const generationStore = idbAvailable ? createStore('keyval-store', 'keyval') : null;

export function isIdbAvailable(): boolean {
	return idbAvailable;
}

export async function get(key: string) {
	if (idbAvailable) return iget(key);
	return miLocalStorage.getItemAsJson(`${PREFIX}${key}`);
}

export async function set(key: string, val: any) {
	if (idbAvailable) return update(key, () => val);
	return miLocalStorage.setItemAsJson(`${PREFIX}${key}`, val);
}

export async function del(key: string) {
	if (idbAvailable) return idel(key);
	return miLocalStorage.removeItem(`${PREFIX}${key}`);
}

export async function clear() {
	if (idbAvailable && generationStore) return generationStore('readwrite', store => new Promise<void>((resolve, reject) => {
		store.clear();
		store.put(crypto.randomUUID(), generationKey);
		store.transaction.oncomplete = () => resolve();
		store.transaction.onerror = () => reject(store.transaction.error);
	}));
}

export async function update<T>(key: string, updater: (previous: T | undefined) => T): Promise<void> {
	if (!idbAvailable) throw new Error('Atomic updates require IndexedDB');
	return iupdate(key, updater, (mode, work) => generationStore!(mode, store => new Promise((resolve, reject) => {
		const request = store.get(generationKey);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			if (request.result !== sessionGeneration) { reject(new Error('Session ended in another tab; reload before saving')); return; }
			try { Promise.resolve(work(store)).then(resolve, reject); } catch (error) { reject(error); }
		};
	})));
}
