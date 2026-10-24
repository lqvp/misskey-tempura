/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import fetch, { Headers as NodeFetchHeaders } from 'node-fetch';
import type * as http from 'node:http';
import type * as https from 'node:https';

const NULL_BODY_STATUSES: number[] = [101, 204, 205, 304];

/**
 * openid-client の customFetch に渡す fetch 関数を作る。
 * discovery / トークン交換 / JWKS 取得の外向き通信を、サーバー設定の outgoing proxy・送信元アドレスを
 * 反映する agent 経由にする (GitHub / Discord の通信と同じ経路)。
 * openid-client は標準 Fetch API の Response を前提にするため、node-fetch の応答を標準 Response に詰め替える。
 * IdP の URL は管理者が設定した値なので、プライベートアドレスの IdP も従来どおり許可する。
 */
export function createOidcFetch(
	getAgent: (url: URL) => http.Agent | https.Agent,
	userAgent: string,
	timeoutMs = 30_000,
): (url: string, options: { method?: string; headers?: any; body?: any; redirect?: string; signal?: AbortSignal | null }) => Promise<Response> {
	return async (url, options) => {
		const headers = new NodeFetchHeaders(options.headers ?? {});
		if (!headers.has('user-agent')) headers.set('user-agent', userAgent);

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		const upstream = options.signal;
		const onAbort = () => controller.abort();
		upstream?.addEventListener('abort', onAbort);
		try {
			const res = await fetch(url, {
				method: options.method ?? 'GET',
				headers,
				body: options.body ?? undefined,
				redirect: (options.redirect as any) ?? 'follow',
				agent: getAgent,
				signal: controller.signal as any,
				size: 10 * 1024 * 1024,
			});
			const buf = NULL_BODY_STATUSES.includes(res.status) ? null : await res.arrayBuffer();
			return new Response(buf, {
				status: res.status,
				statusText: res.statusText,
				headers: Object.fromEntries(res.headers.entries()),
			});
		} finally {
			clearTimeout(timer);
			upstream?.removeEventListener('abort', onAbort);
		}
	};
}
