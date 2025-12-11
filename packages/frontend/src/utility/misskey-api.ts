/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { ref } from 'vue';
import { apiUrl } from '@@/js/config.js';
import { $i } from '@/i.js';
export const pendingApiRequestsCount = ref(0);

// Implements Misskey.api.ApiClient.request
export function misskeyApi<
	E extends keyof Misskey.Endpoints,
	P extends Misskey.Endpoints[E]['req'] = Misskey.Endpoints[E]['req'],
	R = Misskey.api.SwitchCaseResponseType<E, P>,
>(
	endpoint: E,
	data: P = {} as any,
	token?: string | null | undefined,
	signal?: AbortSignal,
): Promise<R> {
	if (endpoint.includes('://')) throw new Error('invalid endpoint');
	pendingApiRequestsCount.value++;

	const payload = data as P & { i?: string | null };

	const onFinally = () => {
		pendingApiRequestsCount.value--;
	};

	const promise = new Promise<R>((resolve, reject) => {
		// Append a credential
		if ($i) payload.i = $i.token;
		if (token !== undefined) payload.i = token;

		// Send request
		window.fetch(`${apiUrl}/${endpoint}`, {
			method: 'POST',
			body: JSON.stringify(payload),
			credentials: 'omit',
			cache: 'no-cache',
			headers: {
				'Content-Type': 'application/json',
			},
			signal,
		}).then(async (res) => {
			const body = res.status === 204 ? null : await res.json();

			if (res.status === 200) {
				resolve(body as R);
			} else if (res.status === 204) {
				resolve(undefined as R); // void -> undefined
			} else {
				reject(body.error);
			}
		}).catch(reject);
	});

	promise.then(onFinally, onFinally);

	return promise;
}

// Implements Misskey.api.ApiClient.request

export function misskeyApiGet<
	E extends keyof Misskey.Endpoints,
	P extends Misskey.Endpoints[E]['req'] = Misskey.Endpoints[E]['req'],
	R = Misskey.api.SwitchCaseResponseType<E, P>,
>(
	endpoint: E,
	data: P = {} as any,
	token?: string | null | undefined,
): Promise<R> {
	pendingApiRequestsCount.value++;

	const onFinally = () => {
		pendingApiRequestsCount.value--;
	};

	const params = { ...data as any } as P & { i?: string | null };
	if ($i) params.i = $i.token;
	if (token !== undefined) params.i = token;

	const query = new URLSearchParams(Object.entries(params).reduce((acc, [k, v]) => {
		if (v == null) return acc;
		acc[k] = String(v);
		return acc;
	}, {} as Record<string, string>));

	const promise = new Promise<R>((resolve, reject) => {
		// Send request
		window.fetch(`${apiUrl}/${endpoint}?${query}`, {
			method: 'GET',
			credentials: 'omit',
			cache: 'default',
			headers: {
				'Content-Type': 'application/json',
			},
		}).then(async (res) => {
			const body = res.status === 204 ? null : await res.json();

			if (res.status === 200) {
				resolve(body as R);
			} else if (res.status === 204) {
				resolve(undefined as R); // void -> undefined
			} else {
				reject(body.error);
			}
		}).catch(reject);
	});

	promise.then(onFinally, onFinally);

	return promise;
}
