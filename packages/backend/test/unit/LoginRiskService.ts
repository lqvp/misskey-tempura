/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { Test } from '@nestjs/testing';
import * as Redis from 'ioredis';
import { GlobalModule } from '@/GlobalModule.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { RoleService } from '@/core/RoleService.js';
import { IpIntelligenceService } from '@/core/IpIntelligenceService.js';
import type { IpIntel } from '@/core/IpIntelligenceService.js';
import { LoginRiskService } from '@/core/LoginRiskService.js';
import { genAidx } from '@/misc/id/aidx.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import { getIpHash } from '@/misc/get-ip-hash.js';
import type { MiMeta, SigninsRepository, UserLoginContextsRepository, UsersRepository } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import type { TestingModule } from '@nestjs/testing';

function fakeLookup(ip: string): IpIntel {
	const intel: IpIntel = { country: null, asn: null, asnOrg: null, tor: false, spamhausDrop: false, datacenter: false, vpn: false };
	if (ip.startsWith('203.0.113.')) return { ...intel, country: 'JP', asn: 64500 };
	if (ip.startsWith('198.51.100.')) return { ...intel, country: 'US', asn: 64501 };
	return intel;
}

describe('LoginRiskService', () => {
	let app: TestingModule;
	let svc: LoginRiskService;
	let meta: MiMeta;
	let redis: Redis.Redis;
	let usersRepository: UsersRepository;
	let signinsRepository: SigninsRepository;
	let userLoginContextsRepository: UserLoginContextsRepository;
	let idService: IdService;
	let user: MiLocalUser;
	const createdUserIds: string[] = [];
	const fakeIntel: { lookup: (ip: string) => IpIntel } = { lookup: fakeLookup };
	const fakeRole = { isModerator: async () => false };

	async function createUser(): Promise<MiLocalUser> {
		const un = secureRndstr(16);
		const id = genAidx(Date.now());
		await usersRepository.insert({ id, username: un, usernameLower: un.toLowerCase() });
		createdUserIds.push(id);
		return await usersRepository.findOneByOrFail({ id }) as MiLocalUser;
	}

	function p(ip: string, deviceToken?: unknown) {
		return { user, ip, headers: {}, deviceToken };
	}

	beforeAll(async () => {
		app = await Test.createTestingModule({
			imports: [GlobalModule],
			providers: [
				LoginRiskService,
				IdService,
				LoggerService,
				{ provide: RoleService, useValue: fakeRole },
				{ provide: IpIntelligenceService, useValue: fakeIntel },
			],
		}).compile();

		svc = app.get(LoginRiskService);
		meta = app.get(DI.meta);
		redis = app.get(DI.redis);
		usersRepository = app.get(DI.usersRepository);
		signinsRepository = app.get(DI.signinsRepository);
		userLoginContextsRepository = app.get(DI.userLoginContextsRepository);
		idService = app.get(IdService);
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(async () => {
		meta.enableLoginRiskDetection = true;
		meta.loginRiskNotifyThreshold = 30;
		meta.loginRiskStepUpThreshold = 60;
		fakeIntel.lookup = fakeLookup;
		fakeRole.isModerator = async () => false;
		user = await createUser();
	});

	afterEach(async () => {
		const keys = [
			...createdUserIds.map(id => `loginRisk:fail:user:${id}`),
			...['203.0.113.5', '198.51.100.5'].map(ip => `loginRisk:fail:ip:${getIpHash(ip)}`),
		];
		await redis.del(...keys);
		await userLoginContextsRepository.createQueryBuilder().delete().execute();
		await signinsRepository.createQueryBuilder().delete().execute();
		await usersRepository.createQueryBuilder().delete().execute();
		createdUserIds.length = 0;
	});

	test('無効なら skipped=disabled', async () => {
		meta.enableLoginRiskDetection = false;
		const ev = await svc.evaluate(p('203.0.113.5'));
		expect(ev.skipped).toBe('disabled');
		expect(ev.level).toBe('allow');
		expect(ev.score).toBe(0);
	});

	test('プライベートIPは untrustedIp', async () => {
		const ev = await svc.evaluate(p('127.0.0.1'));
		expect(ev.skipped).toBe('untrustedIp');
		expect(ev.reasons).toEqual(['untrustedIp']);
		expect(ev.level).toBe('allow');
	});

	test('履歴も学習データもない初回は learning で notify 上限', async () => {
		const ev = await svc.evaluate(p('198.51.100.5'));
		expect(ev.skipped).toBe(false);
		expect(ev.level).not.toBe('stepUp');
		expect(ev.reasons).toContain('learning');
		// 端末トークンを1件も持たないユーザーには newDevice を付けない
		expect(ev.reasons).not.toContain('newDevice');
	});

	test('signin 履歴から初期読み込みされ、既知の国なら allow', async () => {
		await signinsRepository.insert({ id: idService.gen(), userId: user.id, ip: '203.0.113.9', headers: {}, success: true });
		expect((await svc.evaluate(p('203.0.113.5'))).level).toBe('allow');
	});

	test('初期読み込みの hits は一致した履歴の件数になり、3件以上なら learning にならない', async () => {
		for (let i = 0; i < 3; i++) {
			await signinsRepository.insert({ id: idService.gen(), userId: user.id, ip: `203.0.113.${10 + i}`, headers: {}, success: true });
		}
		await signinsRepository.insert({ id: idService.gen(), userId: user.id, ip: '198.51.100.9', headers: {}, success: false });
		await signinsRepository.insert({ id: idService.gen(), userId: user.id, ip: '10.0.0.1', headers: {}, success: true });

		const ev = await svc.evaluate(p('203.0.113.5'));
		expect(ev.reasons).not.toContain('learning');

		const rows = await userLoginContextsRepository.findBy({ userId: user.id });
		expect(rows.map(r => [r.kind, r.hits]).sort()).toEqual([['asn', 3], ['country', 3], ['prefix', 3]]);
		expect(rows.find(r => r.kind === 'country')?.value).toBe('JP');
		expect(rows.find(r => r.kind === 'asn')?.value).toBe('64500');
		// プレフィックスは平文で保存しない
		expect(rows.find(r => r.kind === 'prefix')?.value).toMatch(/^[0-9a-f]{64}$/);
	});

	test('学習後: 既知端末+既知国は allow、新端末+新国は stepUp', async () => {
		const token = await svc.issueDeviceToken(user.id);
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		for (let i = 0; i < 3; i++) await svc.learn(user.id, await svc.evaluate(p('203.0.113.5', token)));
		expect((await svc.evaluate(p('203.0.113.5', token))).level).toBe('allow');
		const ev = await svc.evaluate(p('198.51.100.5', 'A'.repeat(43)));
		expect(ev.level).toBe('stepUp');
		expect(ev.reasons).toEqual(['newDevice', 'newCountry', 'newAsn', 'newPrefix']);
	});

	test('learn は hits を増やし lastSeenAt を更新する', async () => {
		const token = await svc.issueDeviceToken(user.id);
		const ev = await svc.evaluate(p('203.0.113.5', token));
		await svc.learn(user.id, ev);
		await Promise.all([svc.learn(user.id, ev), svc.learn(user.id, ev)]);
		const rows = await userLoginContextsRepository.findBy({ userId: user.id });
		expect(rows.map(r => [r.kind, r.hits]).sort()).toEqual([['asn', 3], ['country', 3], ['device', 4], ['prefix', 3]]);
	});

	test('skipped の評価は学習しない', async () => {
		await svc.learn(user.id, await svc.evaluate(p('127.0.0.1')));
		meta.enableLoginRiskDetection = false;
		await svc.learn(user.id, await svc.evaluate(p('203.0.113.5')));
		expect(await userLoginContextsRepository.countBy({ userId: user.id })).toBe(0);
	});

	test('不正な deviceToken は端末なし扱いで例外にならない', async () => {
		for (const t of [12345, 'x'.repeat(1024 * 1024), { a: 1 }, null, 'A'.repeat(42), `${'A'.repeat(42)}=`]) {
			await expect(svc.evaluate(p('203.0.113.5', t))).resolves.toMatchObject({ skipped: false, deviceTokenHash: null });
		}
	});

	test('recordFailure で accountFailures が付く', async () => {
		for (let i = 0; i < 3; i++) await svc.recordFailure(user.id, '203.0.113.5');
		expect((await svc.evaluate(p('203.0.113.5'))).reasons).toContain('accountFailures');
		expect(await redis.ttl(`loginRisk:fail:user:${user.id}`)).toBeGreaterThan(3500);
	});

	test('同じ IP から5アカウント以上失敗すると ipSpray が付く', async () => {
		for (let i = 0; i < 4; i++) {
			const other = await createUser();
			await svc.recordFailure(other.id, '203.0.113.5');
			await svc.recordFailure(other.id, '203.0.113.5');
		}
		expect((await svc.evaluate(p('203.0.113.5'))).reasons).not.toContain('ipSpray');
		await svc.recordFailure(user.id, '203.0.113.5');
		expect((await svc.evaluate(p('203.0.113.5'))).reasons).toContain('ipSpray');
	});

	test('直近2時間に別の国から成功していれば recentOtherCountry', async () => {
		await signinsRepository.insert({ id: idService.gen(), userId: user.id, ip: '198.51.100.9', headers: {}, success: true, country: 'US' });
		expect((await svc.evaluate(p('203.0.113.5'))).reasons).toContain('recentOtherCountry');
	});

	test('3時間前の別の国や失敗したログインは recentOtherCountry にしない', async () => {
		await signinsRepository.insert({ id: idService.gen(Date.now() - 1000 * 60 * 60 * 3), userId: user.id, ip: '198.51.100.9', headers: {}, success: true, country: 'US' });
		await signinsRepository.insert({ id: idService.gen(), userId: user.id, ip: '198.51.100.9', headers: {}, success: false, country: 'US' });
		expect((await svc.evaluate(p('203.0.113.5'))).reasons).not.toContain('recentOtherCountry');
	});

	test('最後の成功ログインから60日以上なら dormant', async () => {
		await signinsRepository.insert({ id: idService.gen(Date.now() - 1000 * 60 * 60 * 24 * 61), userId: user.id, ip: '203.0.113.9', headers: {}, success: true });
		expect((await svc.evaluate(p('203.0.113.5'))).reasons).toContain('dormant');
	});

	test('モデレーターは点数が1.5倍になる', async () => {
		const normal = await svc.evaluate(p('198.51.100.5'));
		fakeRole.isModerator = async () => true;
		const privileged = await svc.evaluate(p('198.51.100.5'));
		expect(privileged.score).toBe(Math.round(normal.score * 1.5));
	});

	test('intel が例外を投げても skipped=error', async () => {
		fakeIntel.lookup = () => { throw new Error('x'); };
		const ev = await svc.evaluate(p('203.0.113.5'));
		expect(ev.skipped).toBe('error');
		expect(ev.level).toBe('allow');
	});

	describe('buildLearnOnlyEvaluation', () => {
		test('無効・プライベートIP・不正なIPなら null', () => {
			expect(svc.buildLearnOnlyEvaluation('127.0.0.1', {})).toBeNull();
			expect(svc.buildLearnOnlyEvaluation('not-an-ip', {})).toBeNull();
			meta.enableLoginRiskDetection = false;
			expect(svc.buildLearnOnlyEvaluation('203.0.113.5', {})).toBeNull();
		});

		test('学習用の評価を返し、learn で国などが記録される', async () => {
			const ev = svc.buildLearnOnlyEvaluation('203.0.113.5', {});
			expect(ev).toMatchObject({ skipped: false, score: 0, level: 'allow', reasons: [], country: 'JP', asn: 64500, deviceTokenHash: null });
			await svc.learn(user.id, ev!);
			const rows = await userLoginContextsRepository.findBy({ userId: user.id });
			expect(rows.map(r => r.kind).sort()).toEqual(['asn', 'country', 'prefix']);
		});
	});
});
