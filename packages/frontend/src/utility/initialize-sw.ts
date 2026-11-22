/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { lang } from '@@/js/config.js';
import { instance, fetchInstance } from '@/instance.js';

export async function initializeSw() {
	if (!('serviceWorker' in navigator)) return;

	navigator.serviceWorker.register('/sw.js', { scope: '/', type: 'classic' });
	const registration = await navigator.serviceWorker.ready;
	// offlinePageConfig is packed into the instance meta, so make sure the
	// (usually cached) meta is available before handing it to the SW.
	// The meta fetch has no timeout of its own, so cap the wait; on timeout
	// or failure the cached meta (if any) is used as-is.
	try {
		await Promise.race([
			fetchInstance(),
			new Promise<void>(resolve => globalThis.setTimeout(resolve, 5000)),
		]);
	} catch {
		// fall back to the (cached) instance meta on failure
	}
	// The app booted normally, so any offline-page retry bookkeeping left in
	// this tab is stale and must not affect a future outage.
	try {
		sessionStorage.removeItem('misskey:offline-page:retry-attempts');
		sessionStorage.removeItem('misskey:offline-page:recovery-reload');
	} catch {
		// sessionStorage may be unavailable; nothing to clean up
	}
	postInitializeMessage(registration, instance.offlinePageConfig ?? null);
}

function postInitializeMessage(registration: ServiceWorkerRegistration, offlinePageConfig: string | null) {
	registration.active?.postMessage({
		msg: 'initialize',
		lang,
		offlinePageConfig,
	});
}

/**
 * オフラインページ設定を SW に渡し直す。
 * SW は起動時の initializeSw でしか設定を受け取らないため、管理画面で保存した直後に障害が起きると
 * 再読み込みするまで古い案内が表示されてしまう
 */
export async function updateSwOfflinePageConfig(offlinePageConfig: string | null) {
	if (!('serviceWorker' in navigator)) return;
	const registration = await navigator.serviceWorker.getRegistration('/');
	if (registration == null) return;
	postInitializeMessage(registration, offlinePageConfig);
}
