/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createOidcFetch } from '@/misc/sso-oidc-fetch.js';

describe('createOidcFetch (openid-client customFetch)', () => {
	let server: http.Server;
	let base: string;
	const seen: { ua?: string; method?: string; body: string }[] = [];

	beforeAll(async () => {
		server = http.createServer((req, res) => {
			let body = '';
			req.on('data', c => body += c);
			req.on('end', () => {
				seen.push({ ua: req.headers['user-agent'], method: req.method, body });
				if (req.url === '/none') {
					res.statusCode = 204;
					res.end();
				} else {
					res.setHeader('content-type', 'application/json');
					res.end(JSON.stringify({ ok: true }));
				}
			});
		});
		await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
		base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});
	afterAll(() => server.close());

	test('標準 Response を返し、agent 取得関数と User-Agent が使われる', async () => {
		const urls: string[] = [];
		const f = createOidcFetch((url) => {
			urls.push(String(url));
			return new http.Agent();
		}, 'test-agent');
		const res = await f(`${base}/x`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=b' });
		expect(res).toBeInstanceOf(Response);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/json');
		expect(await res.json()).toEqual({ ok: true });
		expect(urls.length).toBeGreaterThan(0);
		expect(seen.at(-1)).toMatchObject({ ua: 'test-agent', method: 'POST', body: 'a=b' });
	});

	test('204 など本文なしの応答も Response にできる', async () => {
		const f = createOidcFetch(() => new http.Agent(), 'ua');
		const res = await f(`${base}/none`, {});
		expect(res.status).toBe(204);
	});
});
