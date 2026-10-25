/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { limitSsoRequest, verifyPasskeyForSso } from '@/server/api/sso-route-helpers.js';
import { WebAuthnService } from '@/core/WebAuthnService.js';

vi.mock('@simplewebauthn/server', async (importOriginal) => {
	const original = await importOriginal<typeof import('@simplewebauthn/server')>();
	return { ...original, verifyAuthenticationResponse: vi.fn() };
});

describe('limitSsoRequest (429 とヘッダー)', () => {
	function create(limitResult: unknown, enable = true) {
		const events: string[] = [];
		const limit = vi.fn(async () => limitResult);
		const reply = {
			code: vi.fn((status: number) => {
				events.push(`code:${status}`);
				return { send: vi.fn((body: unknown) => { events.push('send'); return body; }) };
			}),
		};
		const run = (opts?: Parameters<typeof limitSsoRequest>[4]) => limitSsoRequest({ enableIpRateLimit: enable, rateLimiterService: { limit } }, { ip: '203.0.113.5' }, reply, 'sso-callback', opts);
		return { events, limit, reply, run };
	}

	test('レート制限が無効なら何もせず通す', async () => {
		const { limit, reply, run } = create({ blocked: true }, false);
		expect(await run()).toBe(true);
		expect(limit).not.toHaveBeenCalled();
		expect(reply.code).not.toHaveBeenCalled();
	});

	test('上限内なら通し、429 は送らない', async () => {
		const { reply, run } = create(null);
		expect(await run()).toBe(true);
		expect(reply.code).not.toHaveBeenCalled();
	});

	test('上限を超えたら、beforeReject を送信より先に呼び、429 を送って false を返す', async () => {
		const { events, run } = create({ blocked: true });
		const ok = await run({ beforeReject: () => { events.push('beforeReject'); } });
		expect(ok).toBe(false);
		expect(events).toEqual(['beforeReject', 'code:429', 'send']);
	});

	test('追加認証の送信 (skipMinInterval) には minInterval を課さず、通常のリクエストには課す', async () => {
		const normal = create(null);
		await normal.run();
		expect(normal.limit.mock.calls[0]).toMatchObject([{ key: 'sso-callback', max: 30, minInterval: 1000 }]);

		const additional = create(null);
		await additional.run({ skipMinInterval: true });
		const arg = (additional.limit.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
		expect(arg).toMatchObject({ key: 'sso-callback', max: 30 });
		expect('minInterval' in arg).toBe(false);
	});
});

describe('verifyPasskeyForSso', () => {
	test('検証に成功したら true、失敗(false)なら false', async () => {
		expect(await verifyPasskeyForSso({ verifyAuthentication: async () => true }, 'u', {})).toBe(true);
		expect(await verifyPasskeyForSso({ verifyAuthentication: async () => false }, 'u', {})).toBe(false);
	});

	test('例外 (チャレンジ失効・未登録キー・検証失敗) は失敗として false にする', async () => {
		expect(await verifyPasskeyForSso({ verifyAuthentication: async () => { throw new Error('challenge not found'); } }, 'u', {})).toBe(false);
	});
});

describe('WebAuthnService.verifyAuthentication (検証ライブラリは差し替え)', () => {
	async function create(verified: boolean) {
		const { verifyAuthenticationResponse } = await import('@simplewebauthn/server');
		vi.mocked(verifyAuthenticationResponse).mockReset();
		vi.mocked(verifyAuthenticationResponse).mockResolvedValue({ verified, authenticationInfo: { newCounter: 1, credentialDeviceType: 'singleDevice', credentialBackedUp: false } } as never);
		const store = new Map<string, string>([['webauthn:authenticationChallenge:u1', 'challenge']]);
		const redis = { getdel: async (k: string) => { const v = store.get(k) ?? null; store.delete(k); return v; } };
		const key = { id: 'k1', userId: 'u1', publicKey: 'AAAA', counter: 0, transports: null };
		const update = vi.fn(async () => undefined);
		const repo = { findOneBy: async (w: { id: string; userId: string }) => (w.id === key.id && w.userId === key.userId ? key : null), update };
		const service = new WebAuthnService({ url: 'https://example.test', hostname: 'example.test', host: 'example.test' } as never, { name: null, iconUrl: null } as never, redis as never, repo as never);
		return { service, update, verifyAuthenticationResponse };
	}
	const response = { id: 'k1' } as never;

	test('成功したら true を返してカウンタを更新し、同じチャレンジの再利用は例外で拒否する', async () => {
		const { service, update } = await create(true);
		expect(await verifyPasskeyForSso(service, 'u1', response)).toBe(true);
		expect(update).toHaveBeenCalledTimes(1);
		// チャレンジは一度で消費されるので、同じ応答を再度送っても通らない
		expect(await verifyPasskeyForSso(service, 'u1', response)).toBe(false);
		expect(update).toHaveBeenCalledTimes(1);
	});

	test('検証ライブラリが false を返したらカウンタを更新せず false', async () => {
		const { service, update } = await create(false);
		expect(await verifyPasskeyForSso(service, 'u1', response)).toBe(false);
		expect(update).not.toHaveBeenCalled();
	});

	test('他のユーザーのキーの応答は、チャレンジがあっても拒否する', async () => {
		const { service, verifyAuthenticationResponse } = await create(true);
		expect(await verifyPasskeyForSso(service, 'u1', { id: 'other-key' } as never)).toBe(false);
		expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
	});
});
