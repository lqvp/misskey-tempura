/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** Serialize a synchronous localStorage read/merge/write across tabs.
 * The mutex DB stores no preferences. A readwrite transaction on its one
 * object store is a mutex; the work runs inside a request callback while the
 * transaction is active. Never await inside that callback.
 */
export function withPreferenceLock<T>(work: () => T): Promise<T> {
	// All pages take the same IndexedDB mutex, including pages with Web Locks.
	// Choosing different mutexes per page would not serialize a mixed set of tabs.
	return new Promise((resolve, reject) => {
		const request = indexedDB.open('misskey-preferences-lock', 1);
		request.onupgradeneeded = () => request.result.createObjectStore('mutex');
		request.onerror = () => reject(request.error);
		request.onblocked = () => reject(new Error('Preference lock database is blocked'));
		request.onsuccess = () => {
			const db = request.result;
			const tx = db.transaction('mutex', 'readwrite');
			let result: T;
			let failure: unknown;
			const get = tx.objectStore('mutex').get('lock');
			get.onsuccess = () => {
				try { result = work(); } catch (err) { failure = err; tx.abort(); }
			};
			tx.oncomplete = () => { db.close(); resolve(result); };
			tx.onabort = () => { db.close(); reject(failure ?? tx.error); };
			tx.onerror = () => { db.close(); reject(tx.error); };
		};
	});
}
