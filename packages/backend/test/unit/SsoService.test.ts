/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { SsoService, resolveSsoAdditionalAuthRequirement } from '@/server/api/SsoService.js';
import type { LoggerService } from '@/core/LoggerService.js';

describe('resolveSsoAdditionalAuthRequirement', () => {
	test('trustUpstreamMfa が true なら常に追加認証なし', () => {
		expect(resolveSsoAdditionalAuthRequirement({ twoFactorEnabled: true }, true, true)).toBe('none');
		expect(resolveSsoAdditionalAuthRequirement({ twoFactorEnabled: false }, true, true)).toBe('none');
		expect(resolveSsoAdditionalAuthRequirement(null, false, true)).toBe('none');
	});

	test('TOTP 有効・セキュリティキーなしなら TOTP を要求する', () => {
		expect(resolveSsoAdditionalAuthRequirement({ twoFactorEnabled: true }, false, false)).toBe('totp');
	});

	test('TOTP 有効・セキュリティキーありならパスキーを提示する (TOTP は代替として引き続き受け付ける = ローカルサインインと同一ポリシー)', () => {
		expect(resolveSsoAdditionalAuthRequirement({ twoFactorEnabled: true }, true, false)).toBe('passkey');
	});

	test('セキュリティキーのみの登録では追加認証なし (ローカルでもパスワード単独でサインインできる)', () => {
		expect(resolveSsoAdditionalAuthRequirement({ twoFactorEnabled: false }, true, false)).toBe('none');
		expect(resolveSsoAdditionalAuthRequirement(null, true, false)).toBe('none');
	});

	test('TOTP もセキュリティキーもなければ追加認証なし', () => {
		expect(resolveSsoAdditionalAuthRequirement({ twoFactorEnabled: false }, false, false)).toBe('none');
		expect(resolveSsoAdditionalAuthRequirement(null, false, false)).toBe('none');
	});
});

/** TTL を秒単位で持つだけの最小の Redis 代用 (期限切れは now を進めて再現する) */
class FakeRedis {
	public now = 0;
	private data = new Map<string, { value: string; expiresAt: number | null }>();

	private live(key: string) {
		const e = this.data.get(key);
		if (e == null) return null;
		if (e.expiresAt != null && e.expiresAt <= this.now) {
			this.data.delete(key);
			return null;
		}
		return e;
	}

	public async set(key: string, value: string, _ex?: string, ttl?: number) {
		this.data.set(key, { value, expiresAt: ttl != null ? this.now + ttl : null });
		return 'OK';
	}

	public async get(key: string) {
		return this.live(key)?.value ?? null;
	}

	public async getdel(key: string) {
		const e = this.live(key);
		this.data.delete(key);
		return e?.value ?? null;
	}

	public async del(key: string) {
		return this.data.delete(key) ? 1 : 0;
	}

	public async ttl(key: string) {
		const e = this.live(key);
		if (e == null) return -2;
		if (e.expiresAt == null) return -1;
		return e.expiresAt - this.now;
	}

	public async expire(key: string, seconds: number) {
		const e = this.live(key);
		if (e == null) return 0;
		e.expiresAt = this.now + seconds;
		return 1;
	}

	public async incr(key: string) {
		const e = this.live(key);
		const next = Number(e?.value ?? 0) + 1;
		this.data.set(key, { value: String(next), expiresAt: e?.expiresAt ?? null });
		return next;
	}
}

describe('SsoService ログインコードの寿命と失敗回数 (メール確認コード待ち)', () => {
	function create() {
		const redis = new FakeRedis();
		const loggerService = mockDeep<LoggerService>();
		const service = new SsoService({} as any, {} as any, redis as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, loggerService);
		return { redis, service };
	}

	const pending = JSON.stringify({ userId: 'u', provider: 'p', subject: 's' });

	test('120秒のログインコードを600秒まで延ばす', async () => {
		const { redis, service } = create();
		await redis.set('sso:loginCode:c', pending, 'EX', 120);
		await service.extendLoginCodeForEmailChallenge('c');
		expect(await redis.ttl('sso:loginCode:c')).toBe(600);
	});

	test('すでに600秒以上残っていれば短くしない', async () => {
		const { redis, service } = create();
		await redis.set('sso:loginCode:c', pending, 'EX', 900);
		await service.extendLoginCodeForEmailChallenge('c');
		expect(await redis.ttl('sso:loginCode:c')).toBe(900);
	});

	test('存在しない・期限切れ・消費済みのコードは復活しない', async () => {
		const { redis, service } = create();
		await service.extendLoginCodeForEmailChallenge('none');
		expect(await redis.get('sso:loginCode:none')).toBeNull();

		await redis.set('sso:loginCode:old', pending, 'EX', 120);
		redis.now = 121;
		await service.extendLoginCodeForEmailChallenge('old');
		expect(await service.peekLoginCode('old')).toBeNull();

		await redis.set('sso:loginCode:used', pending, 'EX', 120);
		expect(await service.consumeLoginCode('used')).toBe(true);
		await service.extendLoginCodeForEmailChallenge('used');
		expect(await service.peekLoginCode('used')).toBeNull();
		expect(await service.consumeLoginCode('used')).toBe(false);
	});

	test('再延長は残りが600秒未満のときだけ600秒に戻す(寿命の総量の上限は確認コードの発行回数制限側にある)', async () => {
		const { redis, service } = create();
		await redis.set('sso:loginCode:c', pending, 'EX', 120);
		await service.extendLoginCodeForEmailChallenge('c');
		redis.now = 300;
		await service.extendLoginCodeForEmailChallenge('c');
		// 残り 300 秒 (< 600) なので 600 に戻る。この関数単体には回数の上限は無い
		expect(await redis.ttl('sso:loginCode:c')).toBe(600);
	});

	test('失敗回数は5回で消え、ログインコードも失効する。回数の記録はコードより先に消えない', async () => {
		const { redis, service } = create();
		await redis.set('sso:loginCode:c', pending, 'EX', 120);
		await service.extendLoginCodeForEmailChallenge('c');
		await service.recordAdditionalAuthFailure('c');
		// 初回の失敗でカウンタに付く寿命は、延長後のログインコードと同じ600秒
		expect(await redis.ttl('sso:loginCodeAttempts:c')).toBe(600);
		for (let i = 0; i < 4; i++) await service.recordAdditionalAuthFailure('c');
		expect(await service.peekLoginCode('c')).toBeNull();
	});

	test('ログインコードを延長するとき、先に付いた失敗回数の寿命も同じ長さまで延ばす', async () => {
		const { redis, service } = create();
		await redis.set('sso:loginCode:c', pending, 'EX', 120);
		// 延長の前 (TOTP の失敗など) に付いた失敗回数は、ログインコードと同じ 120 秒の寿命
		await service.recordAdditionalAuthFailure('c');
		await redis.expire('sso:loginCodeAttempts:c', 100);
		await service.extendLoginCodeForEmailChallenge('c');
		expect(await redis.ttl('sso:loginCode:c')).toBe(600);
		expect(await redis.ttl('sso:loginCodeAttempts:c')).toBe(600);
	});

	test('寿命が付いていない失敗カウンタ (最初の失敗の直後に止まった場合) は、次の失敗で寿命が付く', async () => {
		const { redis, service } = create();
		await redis.set('sso:loginCode:c', pending, 'EX', 120);
		// 寿命なしのカウンタが残っている状態を作る
		await redis.set('sso:loginCodeAttempts:c', '1');
		expect(await redis.ttl('sso:loginCodeAttempts:c')).toBe(-1);
		await service.recordAdditionalAuthFailure('c');
		expect(await redis.ttl('sso:loginCodeAttempts:c')).toBeGreaterThan(0);
	});

	test('同じログインコードの並行消費は片方だけ成功する', async () => {
		const { redis, service } = create();
		await redis.set('sso:loginCode:c', pending, 'EX', 120);
		const results = await Promise.all([service.consumeLoginCode('c'), service.consumeLoginCode('c')]);
		expect(results.filter(Boolean)).toHaveLength(1);
	});
});

describe('SsoService ログインコードのブラウザ束縛', () => {
	const service = new SsoService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, mockDeep<LoggerService>());
	const hash = createHash('sha256').update('bind-1').digest('hex');

	test('発行時と同じ束縛値だけ受け付ける', () => {
		expect(service.isLoginCodeBoundTo({ bindingHash: hash }, 'bind-1')).toBe(true);
	});

	test('別のブラウザ (束縛値が違う・無い) は拒否する', () => {
		expect(service.isLoginCodeBoundTo({ bindingHash: hash }, 'bind-2')).toBe(false);
		expect(service.isLoginCodeBoundTo({ bindingHash: hash }, undefined)).toBe(false);
		expect(service.isLoginCodeBoundTo({ bindingHash: hash }, '')).toBe(false);
	});

	test('束縛情報のないコードは受け付けない', () => {
		expect(service.isLoginCodeBoundTo({}, 'bind-1')).toBe(false);
	});
});

describe('SsoService 連携の作成と clientId 変更の競合', () => {
	const provider = { key: 'p', type: 'oidc', clientId: 'cid-old', clientSecret: 's', issuerUrl: 'https://idp.invalid', buttonLabel: null, enabled: true, trustUpstreamMfa: false } as any;

	function create(latestProviders: any[]) {
		const redis = new FakeRedis();
		const insert = vi.fn(async () => undefined);
		const manager = { find: vi.fn(async () => [{ ssoProviders: latestProviders }]), insert };
		const repo = { findOneBy: vi.fn(async () => null), manager: { transaction: async (fn: (m: any) => Promise<void>) => await fn(manager) } };
		const metaService = { fetch: vi.fn(async () => ({ ssoProviders: [provider] })) };
		const service = new SsoService({} as any, repo as any, redis as any, {} as any, {} as any, {} as any, { gen: () => 'id1' } as any, metaService as any, {} as any, { getLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }) } as unknown as LoggerService);
		vi.spyOn(service as any, 'fetchSubject').mockResolvedValue('sub-1');
		return { redis, service, insert };
	}

	const state = JSON.stringify({ provider: 'p', type: 'link', userId: 'u1' });

	test('設定が変わっていなければ連携を作る', async () => {
		const { redis, service, insert } = create([provider]);
		await redis.set('sso:state:st', state, 'EX', 60);
		expect(await service.handleCallback('p', 'code', 'st')).toEqual({ type: 'link', userId: 'u1' });
		expect(insert).toHaveBeenCalledTimes(1);
	});

	test('取得後に clientId が変わっていたら連携を作らない', async () => {
		const { redis, service, insert } = create([{ ...provider, clientId: 'cid-new' }]);
		await redis.set('sso:state:st', state, 'EX', 60);
		await expect(service.handleCallback('p', 'code', 'st')).rejects.toMatchObject({ code: 'INVALID_STATE' });
		expect(insert).not.toHaveBeenCalled();
	});
});
