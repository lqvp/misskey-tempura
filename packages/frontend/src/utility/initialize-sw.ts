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
	try {
		await fetchInstance();
	} catch {
		// fall back to the (cached) instance meta on failure
	}
	registration.active?.postMessage({
		msg: 'initialize',
		lang,
		offlinePageConfig: instance.offlinePageConfig ?? null,
	});
}
