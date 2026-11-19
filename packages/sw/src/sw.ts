/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { get, set } from 'idb-keyval';
import * as Misskey from 'misskey-js';
import { FETCH_TIMEOUT_MS } from '@/const.js';
import type { PushNotificationDataMap } from '@/types.js';
import { createEmptyNotification, createNotification } from '@/scripts/create-notification.js';
import { swLang } from '@/scripts/lang.js';
import * as swos from '@/scripts/operations.js';
import { renderOfflinePage, type OfflinePageConfig, type OfflineReason } from '@/scripts/offline-page.js';

async function getOfflinePageConfig(): Promise<OfflinePageConfig | undefined> {
	let raw: string | null | undefined;
	try {
		raw = await get<string>('offlinePageConfig');
	} catch {
		// IndexedDB may be unavailable; fall back to the default offline page
		return undefined;
	}
	if (raw == null) return undefined;
	try {
		const parsed = JSON.parse(raw) as OfflinePageConfig;
		return parsed.version === 1 ? parsed : undefined;
	} catch {
		return undefined;
	}
}

async function respondToNavigation(request: Request): Promise<Response> {
	const controller = new AbortController();
	const timeout = globalThis.setTimeout(() => {
		controller.abort('navigation-timeout');
	}, FETCH_TIMEOUT_MS);

	let reason: OfflineReason;

	try {
		const response = await fetch(request, { signal: controller.signal });

		if (response?.status && response.status < 500) return response;
		if (response?.type === 'opaqueredirect') return response;

		reason = { kind: 'server', status: response?.status ?? 0 };
	} catch (error) {
		if (_DEV_) {
			console.warn('navigation fetch failed; showing offline page', error);
		}
		reason = { kind: 'network' };
	} finally {
		globalThis.clearTimeout(timeout);
	}

	const html = await renderOfflinePage(reason, await getOfflinePageConfig());
	return new Response(html, {
		status: 200,
		headers: {
			'content-type': 'text/html',
		},
	});
}

globalThis.addEventListener('install', (ev) => {
	// 次の問題が発生するため、ServiceWorkerAutoPreload をオプトアウトする必要がある
	// ルールを1つでも登録すればオプトアウトされる
	// https://issues.chromium.org/issues/466790291
	if ('addRoutes' in ev) {
		// doc: https://developer.mozilla.org/en-US/docs/Web/API/InstallEvent/addRoutes
		const addRoutes = (rules: unknown) => (ev.addRoutes as (rules: unknown) => Promise<void>).call(ev, rules);

		// doc: https://developer.mozilla.org/ja/docs/Web/API/URLPattern
		const anyUrl = new URLPattern({});
		const urlEndsWithSlash = new URLPattern({ pathname: '*/', search: '' });

		ev.waitUntil(addRoutes([
			{ condition: { requestMode: 'navigate' }, source: 'fetch-event' },
			// fetchハンドラーはURLが/で終わるリクエストもHTMLとして扱う (クエリが付くと/では終わらない)
			{ condition: { urlPattern: urlEndsWithSlash }, source: 'fetch-event' },
			// ルールは先に一致したものが優先されるので、これは上記以外のすべてに当たる
			{ condition: { urlPattern: anyUrl }, source: 'network' },
		]).catch(() => addRoutes({
			// 上記のルールを受け付けないブラウザでも、オプトアウトは維持する
			condition: { urlPattern: anyUrl },
			source: 'fetch-event',
		})).catch(() => {
			// ルールの登録に失敗してもインストールは止めない
		}));
	}
});

globalThis.addEventListener('activate', ev => {
	ev.waitUntil(
		caches.keys()
			.then(cacheNames => Promise.all(
				cacheNames
					.filter((v) => v !== swLang.cacheName)
					.map(name => caches.delete(name)),
			))
			.then(() => globalThis.clients.claim()),
	);
});

globalThis.addEventListener('fetch', ev => {
	let isHTMLRequest = false;
	if (ev.request.headers.get('sec-fetch-dest') === 'document') {
		isHTMLRequest = true;
	} else if (ev.request.headers.get('accept')?.includes('/html')) {
		isHTMLRequest = true;
	} else if (ev.request.url.endsWith('/')) {
		isHTMLRequest = true;
	}

	if (!isHTMLRequest) return;
	ev.respondWith(respondToNavigation(ev.request));
});

globalThis.addEventListener('push', ev => {
	// クライアント取得
	ev.waitUntil(globalThis.clients.matchAll({
		includeUncontrolled: true,
		type: 'window',
	}).then(async () => {
		const data: PushNotificationDataMap[keyof PushNotificationDataMap] = ev.data?.json();

		switch (data.type) {
			// case 'driveFileCreated':
			case 'notification':
			case 'unreadAntennaNote':
			case 'newChatMessage':
				// 1日以上経過している場合は無視
				if (Date.now() - data.dateTime > 1000 * 60 * 60 * 24) break;

				return createNotification(data);
			case 'readAllNotifications':
				await globalThis.registration.getNotifications()
					.then(notifications => notifications.forEach(n => n.tag !== 'read_notification' && n.close()));
				break;
		}

		await createEmptyNotification();
		return;
	}));
});

globalThis.addEventListener('notificationclick', (ev: ServiceWorkerGlobalScopeEventMap['notificationclick']) => {
	ev.waitUntil((async (): Promise<void> => {
		if (_DEV_) {
			console.log('notificationclick', ev.action, ev.notification.data);
		}

		const { action, notification } = ev;
		const data: PushNotificationDataMap[keyof PushNotificationDataMap] = notification.data ?? {};
		const { userId: loginId } = data;
		let client: WindowClient | null = null;

		switch (data.type) {
			case 'notification':
				switch (action) {
					case 'follow':
						if ('userId' in data.body) await swos.api('following/create', loginId, { userId: data.body.userId });
						break;
					case 'showUser':
						if ('user' in data.body) client = await swos.openUser(Misskey.acct.toString(data.body.user), loginId);
						break;
					case 'reply':
						if ('note' in data.body) client = await swos.openPost({ reply: data.body.note }, loginId);
						break;
					case 'renote':
						if ('note' in data.body) await swos.api('notes/create', loginId, { renoteId: data.body.note.id });
						break;
					case 'accept':
						switch (data.body.type) {
							case 'receiveFollowRequest':
								await swos.api('following/requests/accept', loginId, { userId: data.body.userId });
								break;
						}
						break;
					case 'reject':
						switch (data.body.type) {
							case 'receiveFollowRequest':
								await swos.api('following/requests/reject', loginId, { userId: data.body.userId });
								break;
						}
						break;
					case 'showFollowRequests':
						client = await swos.openClient('push', '/my/follow-requests', loginId);
						break;
					default:
						switch (data.body.type) {
							case 'receiveFollowRequest':
								client = await swos.openClient('push', '/my/follow-requests', loginId);
								break;
							case 'reaction':
								client = await swos.openNote(data.body.note.id, loginId);
								break;
							default:
								if ('note' in data.body) {
									client = await swos.openNote(data.body.note.id, loginId);
								} else if ('user' in data.body) {
									client = await swos.openUser(Misskey.acct.toString(data.body.user), loginId);
								}
								break;
						}
				}
				break;
			case 'unreadAntennaNote':
				client = await swos.openAntenna(data.body.antenna.id, loginId);
				break;
			case 'newChatMessage':
				client = await swos.openChat(data.body, loginId);
				break;
			default:
				switch (action) {
					case 'markAllAsRead':
						await globalThis.registration.getNotifications()
							.then(notifications => notifications.forEach(n => n.tag !== 'read_notification' && n.close()));
						await get<Pick<Misskey.entities.SignupResponse, 'id' | 'token'>[]>('accounts').then(accounts => {
							return Promise.all((accounts ?? []).map(async account => {
								await swos.sendMarkAllAsRead(account.id);
							}));
						});
						break;
					case 'settings':
						client = await swos.openClient('push', '/settings/notifications', loginId);
						break;
				}
		}

		if (client) {
			client.focus();
		}
		if (data.type === 'notification') {
			await swos.sendMarkAllAsRead(loginId);
		}

		notification.close();
	})());
});

globalThis.addEventListener('notificationclose', (ev: ServiceWorkerGlobalScopeEventMap['notificationclose']) => {
	const data: PushNotificationDataMap[keyof PushNotificationDataMap] = ev.notification.data;

	ev.waitUntil((async (): Promise<void> => {
		if (data.type === 'notification') {
			await swos.sendMarkAllAsRead(data.userId);
		}
		return;
	})());
});

globalThis.addEventListener('message', (ev: ServiceWorkerGlobalScopeEventMap['message']) => {
	ev.waitUntil((async (): Promise<void> => {
		switch (ev.data) {
			case 'clear':
				// Cache Storage全削除
				await caches.keys()
					.then(cacheNames => Promise.all(
						cacheNames.map(name => caches.delete(name)),
					));
				return; // TODO
		}

		if (typeof ev.data === 'object') {
			// E.g. '[object Array]' → 'array'
			const otype = Object.prototype.toString.call(ev.data).slice(8, -1).toLowerCase();

			if (otype === 'object') {
				if (ev.data.msg === 'initialize') {
					swLang.setLang(ev.data.lang);
					// The frontend sends the instance's offlinePageConfig (JSON string or null);
					// persist it so it can be used when rendering the offline page.
					if (ev.data.offlinePageConfig !== undefined) {
						await set('offlinePageConfig', ev.data.offlinePageConfig);
					}
				}
			}
		}
	})());
});
