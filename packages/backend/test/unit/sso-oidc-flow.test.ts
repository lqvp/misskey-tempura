/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as http from 'node:http';
import * as crypto from 'node:crypto';
import * as net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { HttpProxyAgent } from 'hpagent';
import { discovery, authorizationCodeGrant, allowInsecureRequests, customFetch } from 'openid-client';
import { createOidcFetch } from '@/misc/sso-oidc-fetch.js';

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/**
 * ローカルの IdP (discovery / token / JWKS) と、通過を記録する HTTP プロキシを立て、
 * openid-client が customFetch 経由でプロキシを通って discovery・トークン交換・ID トークン検証まで動くことを確認する。
 * (JWKS は、トークンエンドポイントから直接受け取った ID トークンでは署名検証が省略されるため取得されず、ここでは対象外)
 */
describe('OIDC フロー全体 (customFetch + proxy)', () => {
	let idp: http.Server;
	let proxy: http.Server;
	let issuer: string;
	let proxyUrl: string;
	const proxied: string[] = [];
	const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
	const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
	let nonceForToken = '';
	const idpPaths: string[] = [];

	function idToken(): string {
		const now = Math.floor(Date.now() / 1000);
		const header = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' }));
		const payload = b64u(JSON.stringify({ iss: issuer, sub: 'user-1', aud: 'cid', exp: now + 300, iat: now, nonce: nonceForToken }));
		const sig = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey);
		return `${header}.${payload}.${b64u(sig)}`;
	}

	beforeAll(async () => {
		idp = http.createServer((req, res) => {
			idpPaths.push(`${req.method} ${req.url}`);
			res.setHeader('content-type', 'application/json');
			if (req.url === '/.well-known/openid-configuration') {
				res.end(JSON.stringify({
					issuer,
					authorization_endpoint: `${issuer}/auth`,
					token_endpoint: `${issuer}/token`,
					jwks_uri: `${issuer}/jwks`,
					response_types_supported: ['code'],
					subject_types_supported: ['public'],
					id_token_signing_alg_values_supported: ['RS256'],
				}));
			} else if (req.url === '/jwks') {
				res.end(JSON.stringify({ keys: [jwk] }));
			} else if (req.url === '/token') {
				req.resume();
				req.on('end', () => res.end(JSON.stringify({ access_token: 'at', token_type: 'Bearer', id_token: idToken() })));
			} else {
				res.statusCode = 404;
				res.end('{}');
			}
		});
		await new Promise<void>(r => idp.listen(0, '127.0.0.1', r));
		issuer = `http://127.0.0.1:${(idp.address() as AddressInfo).port}`;

		// CONNECT トンネルの要求を記録して IdP へ中継する簡易プロキシ (hpagent は CONNECT を使う)
		proxy = http.createServer((_req, res) => {
			res.statusCode = 400;
			res.end();
		});
		proxy.on('connect', (req, clientSocket, head) => {
			proxied.push(`CONNECT ${req.url}`);
			const [host, port] = req.url!.split(':');
			const upstream = net.connect(Number(port), host, () => {
				clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
				upstream.write(head);
				upstream.pipe(clientSocket);
				clientSocket.pipe(upstream);
			});
			upstream.on('error', () => clientSocket.destroy());
			clientSocket.on('error', () => upstream.destroy());
		});
		await new Promise<void>(r => proxy.listen(0, '127.0.0.1', r));
		proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
	});
	afterAll(() => {
		idp.close();
		proxy.close();
	});

	test('discovery・トークン交換がプロキシ経由で行われ、ID トークンが検証される', async () => {
		proxied.length = 0;
		idpPaths.length = 0;
		const agent = new HttpProxyAgent({ proxy: proxyUrl });
		const config = await discovery(new URL(issuer), 'cid', 'secret', undefined, {
			execute: [allowInsecureRequests],
			[customFetch]: createOidcFetch(() => agent, 'test-agent'),
		});
		nonceForToken = 'n1';
		const current = new URL(`http://localhost/cb?code=abc&state=s1&iss=${encodeURIComponent(issuer)}`);
		const res = await authorizationCodeGrant(config, current, { expectedNonce: 'n1', expectedState: 's1' });
		expect(res.claims()?.sub).toBe('user-1');
		// IdP への 2 種類の通信(discovery / token)が、それぞれ別のプロキシトンネルを通って届いている
		expect(idpPaths).toEqual(expect.arrayContaining(['GET /.well-known/openid-configuration', 'POST /token']));
		expect(proxied.length).toBeGreaterThanOrEqual(2);
		expect(proxied.every(l => l === `CONNECT ${new URL(issuer).host}`)).toBe(true);
	});

	test('nonce が違う ID トークンは拒否される', async () => {
		const agent = new HttpProxyAgent({ proxy: proxyUrl });
		const config = await discovery(new URL(issuer), 'cid', 'secret', undefined, {
			execute: [allowInsecureRequests],
			[customFetch]: createOidcFetch(() => agent, 'test-agent'),
		});
		nonceForToken = 'other';
		const current = new URL(`http://localhost/cb?code=abc&state=s1&iss=${encodeURIComponent(issuer)}`);
		await expect(authorizationCodeGrant(config, current, { expectedNonce: 'n1', expectedState: 's1' })).rejects.toThrow();
	});
});
