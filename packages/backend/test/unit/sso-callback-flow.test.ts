/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as https from 'node:https';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { SsoService, SsoError } from '@/server/api/SsoService.js';
import type { LoggerService } from '@/core/LoggerService.js';

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

class MemoryRedis {
	private data = new Map<string, string>();
	public async set(key: string, value: string) {
		this.data.set(key, value);
		return 'OK';
	}
	public async get(key: string) {
		return this.data.get(key) ?? null;
	}
	public async getdel(key: string) {
		const v = this.data.get(key) ?? null;
		this.data.delete(key);
		return v;
	}
}

interface LinkRow { id: string; userId: string; provider: string; providerIssuer: string; providerUserId: string; createdAt: Date }

class MemoryLinks {
	public rows: LinkRow[] = [];
	public async findOneBy(where: Partial<LinkRow>) {
		return this.rows.find(r => Object.entries(where).every(([k, v]) => (r as any)[k] === v)) ?? null;
	}
	public async insert(row: LinkRow) {
		this.rows.push(row);
	}
}

/**
 * 本物の SsoService と openid-client を、ローカルの HTTPS IdP (この試験専用の自己署名証明書) に向けて動かし、
 * 認可開始 → コールバック → 連携の作成 / ログインコードの発行まで通して確認する。
 * 証明書の信頼はこの試験の agent だけに与え、プロセス全体の設定は変えない。
 */
describe('SsoService コールバック全体 (実 openid-client + ローカル HTTPS IdP)', () => {
	let idp: https.Server;
	let issuer: string;
	let tmp: string;
	let agent: https.Agent;
	const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
	const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
	const next = { sub: 'sub-A', nonce: '' };

	function idToken(): string {
		const now = Math.floor(Date.now() / 1000);
		const header = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' }));
		const payload = b64u(JSON.stringify({ iss: issuer, sub: next.sub, aud: 'cid', exp: now + 300, iat: now, nonce: next.nonce }));
		const sig = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey);
		return `${header}.${payload}.${b64u(sig)}`;
	}

	beforeAll(async () => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sso-idp-'));
		const keyFile = path.join(tmp, 'key.pem');
		const certFile = path.join(tmp, 'cert.pem');
		execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' });
		const cert = fs.readFileSync(certFile);
		agent = new https.Agent({ ca: cert });

		idp = https.createServer({ key: fs.readFileSync(keyFile), cert }, (req, res) => {
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
		await new Promise<void>(r => idp.listen(0, r));
		issuer = `https://localhost:${(idp.address() as AddressInfo).port}`;
	}, 60_000);

	afterAll(() => {
		idp.close();
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	function create() {
		const links = new MemoryLinks();
		const redis = new MemoryRedis();
		let seq = 0;
		const provider = { key: 'idp', type: 'oidc' as const, clientId: 'cid', clientSecret: 'csecret', issuerUrl: issuer, enabled: true, trustUpstreamMfa: false };
		const service = new SsoService(
			{ url: 'https://misskey.test', userAgent: 'test-agent' } as any,
			links as any,
			redis as any,
			{} as any,
			{} as any,
			{} as any,
			{ gen: () => `id${++seq}` } as any,
			{ fetch: async () => ({ ssoProviders: [provider] }) } as any,
			{ getAgentByUrl: () => agent } as any,
			mockDeep<LoggerService>(),
		);
		return { service, links, redis };
	}

	/** 認可URLから state と nonce を取り出し、IdP が同じ nonce の ID トークンを返すようにする */
	function prepare(authorizationUrl: string, sub: string) {
		const url = new URL(authorizationUrl);
		next.sub = sub;
		next.nonce = url.searchParams.get('nonce')!;
		return url.searchParams.get('state')!;
	}

	test('連携の開始から完了まで通り、ID トークンの sub と発行者が連携に保存される', async () => {
		const { service, links } = create();
		const { authorizationUrl, binding } = await service.initiate('link', 'idp', 'user-1');
		const state = prepare(authorizationUrl, 'sub-A');

		const result = await service.handleCallback('idp', 'code', state, binding);
		expect(result).toEqual({ type: 'link', userId: 'user-1' });
		expect(links.rows).toHaveLength(1);
		expect(links.rows[0]).toMatchObject({ userId: 'user-1', provider: 'idp', providerUserId: 'sub-A', providerIssuer: `oidc:${issuer}` });
	});

	test('連携済みのログインはログインコードを発行し、コードは開始したブラウザに束縛される', async () => {
		const { service, links } = create();
		links.rows.push({ id: 'l1', userId: 'user-1', provider: 'idp', providerIssuer: `oidc:${issuer}`, providerUserId: 'sub-A', createdAt: new Date() });
		const { authorizationUrl, binding } = await service.initiate('login', 'idp');
		const state = prepare(authorizationUrl, 'sub-A');

		const result = await service.handleCallback('idp', 'code', state, binding);
		expect(result.type).toBe('login');
		const pending = await service.peekLoginCode((result as { loginCode: string }).loginCode);
		expect(pending).toMatchObject({ userId: 'user-1', provider: 'idp', subject: 'sub-A' });
		expect(service.isLoginCodeBoundTo(pending!, binding)).toBe(true);
		expect(service.isLoginCodeBoundTo(pending!, 'other-browser')).toBe(false);
	});

	test('別のブラウザ (束縛値が違う) からのコールバックは拒否し、state は使い切られる', async () => {
		const { service, links } = create();
		links.rows.push({ id: 'l1', userId: 'user-1', provider: 'idp', providerIssuer: `oidc:${issuer}`, providerUserId: 'sub-A', createdAt: new Date() });
		const { authorizationUrl } = await service.initiate('login', 'idp');
		const state = prepare(authorizationUrl, 'sub-A');

		await expect(service.handleCallback('idp', 'code', state, 'other-browser')).rejects.toMatchObject({ code: 'INVALID_STATE' });
		await expect(service.handleCallback('idp', 'code', state, 'other-browser')).rejects.toBeInstanceOf(SsoError);
	});

	test('別の発行者で作られた連携は、同じ sub でもログインさせない', async () => {
		const { service, links } = create();
		links.rows.push({ id: 'l1', userId: 'user-1', provider: 'idp', providerIssuer: 'oidc:https://old-idp.invalid', providerUserId: 'sub-A', createdAt: new Date() });
		const { authorizationUrl, binding } = await service.initiate('login', 'idp');
		const state = prepare(authorizationUrl, 'sub-A');

		await expect(service.handleCallback('idp', 'code', state, binding)).rejects.toMatchObject({ code: 'NOT_LINKED' });
	});

	test('nonce が違う ID トークンは拒否され、連携は作られない', async () => {
		const { service, links } = create();
		const { authorizationUrl, binding } = await service.initiate('link', 'idp', 'user-1');
		const state = prepare(authorizationUrl, 'sub-A');
		next.nonce = 'forged-nonce';

		await expect(service.handleCallback('idp', 'code', state, binding)).rejects.toThrow();
		expect(links.rows).toHaveLength(0);
	});
});
