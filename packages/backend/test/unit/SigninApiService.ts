/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import * as Redis from 'ioredis';
import { GlobalModule } from '@/GlobalModule.js';
import { CoreModule } from '@/core/CoreModule.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { EmailService } from '@/core/EmailService.js';
import { UserAuthService } from '@/core/UserAuthService.js';
import { IpIntelligenceService } from '@/core/IpIntelligenceService.js';
import type { IpIntel } from '@/core/IpIntelligenceService.js';
import { LoginRiskService } from '@/core/LoginRiskService.js';
import { genAidx } from '@/misc/id/aidx.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import { getIpHash } from '@/misc/get-ip-hash.js';
import { SigninApiService } from '@/server/api/SigninApiService.js';
import { SigninService } from '@/server/api/SigninService.js';
import { LoginChallengeService } from '@/server/api/LoginChallengeService.js';
import { RateLimiterService } from '@/server/api/RateLimiterService.js';
import type { MiMeta, SigninsRepository, UserLoginContextsRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import type { TestingModule } from '@nestjs/testing';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { IncomingHttpHeaders } from 'node:http';

const LOGIN_CHALLENGE_INVALID = 'b3fddf43-a0d3-41f3-9ca9-8de701a6f418';
const LOGIN_CHALLENGE_EXPIRED = '9939b972-0830-4a48-a1b4-f6fe9d259a89';
const LOGIN_CHALLENGE_TOO_MANY_ATTEMPTS = '7606fbea-f065-4c3f-9040-4fb2c884e1b6';
const LOGIN_CHALLENGE_RATE_LIMITED = '20345fd1-1f7c-4d48-b4e8-cd169c500f2c';

const JP_IP = '203.0.113.5';
const US_IP = '198.51.100.5';
const PASSWORD = 'correct horse';

function fakeLookup(ip: string): IpIntel {
	const intel: IpIntel = { country: null, asn: null, asnOrg: null, tor: false, spamhausDrop: false, datacenter: false, vpn: false };
	if (ip.startsWith('203.0.113.')) return { ...intel, country: 'JP', asn: 64500, asnOrg: 'Example JP' };
	if (ip.startsWith('198.51.100.')) return { ...intel, country: 'US', asn: 64501, asnOrg: 'Example US' };
	return intel;
}

class FakeLimiter {
	public async limit() {
		return;
	}
}

type SentEmail = { to: string; subject: string; html: string; text: string };

class FakeEmailService {
	public sent: SentEmail[] = [];
	public get last(): SentEmail {
		return this.sent[this.sent.length - 1];
	}
	public async sendEmail(to: string, subject: string, html: string, text: string) {
		this.sent.push({ to, subject, html, text });
	}
}

class DummyFastifyReply {
	public statusCode: number;
	code(num: number): void {
		this.statusCode = num;
	}
	header(): void {
	}
}

class DummyFastifyRequest {
	public ip: string;
	public body: Record<string, unknown>;
	public headers: IncomingHttpHeaders;
	constructor(body: Record<string, unknown>, ip: string, headers: IncomingHttpHeaders = { 'accept': 'application/json' }) {
		this.ip = ip;
		this.body = body;
		this.headers = headers;
	}
}

describe('SigninApiService', () => {
	let app: TestingModule;
	let signinApiService: SigninApiService;
	let loginRiskService: LoginRiskService;
	let userAuthService: UserAuthService;
	let meta: MiMeta;
	let redis: Redis.Redis;
	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;
	let signinsRepository: SigninsRepository;
	let userLoginContextsRepository: UserLoginContextsRepository;
	let idService: IdService;
	let fakeEmail: FakeEmailService;
	let signinService: SigninService;
	let passwordHash: string;
	const createdUserIds: string[] = [];
	/** レスポンス後に行う記録・メール。後片付けの前に待つ */
	const pendingAfterSignin: Promise<unknown>[] = [];

	async function createUser(opts: { username?: string; name?: string | null; email?: string | null; twoFactorEnabled?: boolean } = {}): Promise<MiLocalUser> {
		const username = opts.username ?? secureRndstr(16);
		const id = genAidx(Date.now());
		await usersRepository.insert({
			id,
			username,
			usernameLower: username.toLowerCase(),
			name: opts.name ?? null,
			host: null,
			token: secureRndstr(16),
		});
		const email = opts.email === undefined ? `${username}@example.com` : opts.email;
		await userProfilesRepository.insert({
			userId: id,
			password: passwordHash,
			email,
			emailVerified: email != null,
			twoFactorEnabled: opts.twoFactorEnabled ?? false,
		});
		createdUserIds.push(id);
		return await usersRepository.findOneByOrFail({ id }) as MiLocalUser;
	}

	/** JP から3回成功した履歴と端末トークンを持つ状態にする */
	async function seedKnownEnvironment(user: MiLocalUser): Promise<string> {
		for (let i = 0; i < 3; i++) {
			await signinsRepository.insert({ id: idService.gen(), userId: user.id, ip: `203.0.113.${10 + i}`, headers: {}, success: true });
		}
		return await loginRiskService.issueDeviceToken(user.id);
	}

	async function call(body: Record<string, unknown>, ip: string, headers?: IncomingHttpHeaders) {
		const req = new DummyFastifyRequest(body, ip, headers) as unknown as FastifyRequest<{ Body: any }>;
		const reply = new DummyFastifyReply();
		const res = await signinApiService.signin(req, reply as unknown as FastifyReply) as any;
		return { status: reply.statusCode, res };
	}

	function lastCode(): string {
		const m = fakeEmail.last.text.match(/\b(\d{6})\b/);
		if (m == null) throw new Error('no code in email');
		return m[1];
	}

	/** 新しい国・新しい端末から正しいパスワードでログインし、確認コードを発行させる */
	async function requestChallenge(user: MiLocalUser, username = user.username) {
		const { res } = await call({ username, password: PASSWORD }, US_IP);
		expect(res.next).toBe('emailCode');
		return { challengeId: res.challengeId as string, code: lastCode() };
	}

	beforeAll(async () => {
		passwordHash = await bcrypt.hash(PASSWORD, 4);
		fakeEmail = new FakeEmailService();
		app = await Test.createTestingModule({
			imports: [GlobalModule, CoreModule],
			providers: [
				SigninApiService,
				SigninService,
				LoginChallengeService,
				{ provide: RateLimiterService, useClass: FakeLimiter },
			],
		})
			.overrideProvider(EmailService).useValue(fakeEmail)
			.overrideProvider(IpIntelligenceService).useValue({ lookup: fakeLookup })
			.useMocker((token) => {
				if (typeof token === 'function') {
					return mockDeep<typeof token>();
				}
			})
			.compile();

		signinApiService = app.get(SigninApiService);
		signinService = app.get(SigninService);
		loginRiskService = app.get(LoginRiskService);
		userAuthService = app.get(UserAuthService);
		meta = app.get(DI.meta);
		redis = app.get(DI.redis);
		usersRepository = app.get(DI.usersRepository);
		userProfilesRepository = app.get(DI.userProfilesRepository);
		signinsRepository = app.get(DI.signinsRepository);
		userLoginContextsRepository = app.get(DI.userLoginContextsRepository);
		idService = app.get(IdService);
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		meta.enableLoginRiskDetection = true;
		meta.loginRiskNotifyThreshold = 30;
		meta.loginRiskStepUpThreshold = 60;
		meta.loginRiskFlagUnverifiedUsers = false;
		meta.enableEmail = true;
		fakeEmail.sent.length = 0;

		const afterSignin = (signinService as any).afterSignin.bind(signinService);
		vi.spyOn(signinService as any, 'afterSignin').mockImplementation((...args: unknown[]) => {
			const p = afterSignin(...args);
			pendingAfterSignin.push(p);
			return p;
		});
	});

	afterEach(async () => {
		await Promise.all(pendingAfterSignin.splice(0));
		vi.restoreAllMocks();
		const keys = [
			...createdUserIds.flatMap(id => [`loginRisk:fail:user:${id}`, `loginRisk:challengeIssue:${id}`]),
			...[JP_IP, US_IP].map(ip => `loginRisk:fail:ip:${getIpHash(ip)}`),
		];
		if (keys.length > 0) await redis.del(...keys);
		await userLoginContextsRepository.createQueryBuilder().delete().execute();
		await signinsRepository.createQueryBuilder().delete().execute();
		await userProfilesRepository.createQueryBuilder().delete().execute();
		await usersRepository.createQueryBuilder().delete().execute();
		createdUserIds.length = 0;
	});

	it('機能無効: 従来どおり finished:true、deviceToken なし', async () => {
		meta.enableLoginRiskDetection = false;
		const user = await createUser();
		const { status, res } = await call({ username: user.username, password: PASSWORD }, US_IP);
		expect(status).toBe(200);
		expect(res.finished).toBe(true);
		expect(res.i).toBe(user.token);
		expect(res.deviceToken).toBeUndefined();
		expect(await userLoginContextsRepository.countBy({ userId: user.id })).toBe(0);
	});

	it('既知環境: finished:true + deviceToken を返す', async () => {
		const user = await createUser();
		const deviceToken = await seedKnownEnvironment(user);
		const { res } = await call({ username: user.username, password: PASSWORD, deviceToken }, JP_IP);
		expect(res.finished).toBe(true);
		expect(res.i).toBe(user.token);
		expect(typeof res.deviceToken).toBe('string');
		expect(res.deviceToken).not.toBe(deviceToken);
	});

	it('新しい国+新端末+メールあり: next=emailCode、メールに6桁コード', async () => {
		const user = await createUser();
		await seedKnownEnvironment(user);
		const { status, res } = await call({ username: user.username, password: PASSWORD }, US_IP);
		expect(status).toBe(200);
		expect(res).toEqual({ finished: false, next: 'emailCode', challengeId: expect.any(String) });
		expect(fakeEmail.last.subject).toBe('Login verification code / ログイン確認コード');
		expect(fakeEmail.last.to).toBe(`${user.username}@example.com`);
		expect(fakeEmail.last.text).toMatch(/\b\d{6}\b/);
		expect(fakeEmail.last.text).toContain('US');
		expect(fakeEmail.last.text).toContain('Example US');

		const rows = await signinsRepository.findBy({ userId: user.id, challenge: 'emailCode' });
		expect(rows).toHaveLength(1);
		expect(rows[0].success).toBe(false);
		expect(rows[0].country).toBe('US');
		// 確認コードの発行は失敗として数えない
		expect(await redis.get(`loginRisk:fail:user:${user.id}`)).toBeNull();
	});

	it('正しいコードで finished:true、二度目は expired', async () => {
		const user = await createUser();
		await seedKnownEnvironment(user);
		const { challengeId, code } = await requestChallenge(user);

		const first = await call({ username: user.username, challengeId, emailCode: code }, US_IP);
		expect(first.res.finished).toBe(true);
		expect(first.res.i).toBe(user.token);
		expect(typeof first.res.deviceToken).toBe('string');

		const second = await call({ username: user.username, challengeId, emailCode: code }, US_IP);
		expect(second.status).toBe(403);
		expect(second.res.error.id).toBe(LOGIN_CHALLENGE_EXPIRED);
	});

	it('同じ challenge に正しいコードを同時2回 → 成功は1回だけ', async () => {
		const user = await createUser();
		await seedKnownEnvironment(user);
		const { challengeId, code } = await requestChallenge(user);

		const results = await Promise.all([
			call({ username: user.username, challengeId, emailCode: code }, US_IP),
			call({ username: user.username, challengeId, emailCode: code }, US_IP),
		]);
		expect(results.filter(r => r.res.finished === true)).toHaveLength(1);
		expect(results.filter(r => r.res.error?.id === LOGIN_CHALLENGE_EXPIRED)).toHaveLength(1);
	});

	it('ユーザー名の大小文字が違っても照合できる', async () => {
		const user = await createUser({ username: `Alice${secureRndstr(8)}` });
		await seedKnownEnvironment(user);
		const { challengeId, code } = await requestChallenge(user, user.username);
		const { res } = await call({ username: user.username.toLowerCase(), challengeId, emailCode: code }, US_IP);
		expect(res.finished).toBe(true);
	});

	it('別のユーザーの challenge は使えない', async () => {
		const user = await createUser();
		const other = await createUser();
		await seedKnownEnvironment(user);
		const { challengeId, code } = await requestChallenge(user);
		const { status, res } = await call({ username: other.username, challengeId, emailCode: code }, US_IP);
		expect(status).toBe(403);
		expect(res.error.id).toBe(LOGIN_CHALLENGE_EXPIRED);
		// 他人の challenge では失敗として数えない
		expect(await redis.get(`loginRisk:fail:user:${other.id}`)).toBeNull();
		expect(await signinsRepository.countBy({ userId: other.id })).toBe(0);
		// 持ち主の challenge は消費されず、本人はまだ使える
		const own = await call({ username: user.username, challengeId, emailCode: code }, US_IP);
		expect(own.res.finished).toBe(true);
	});

	it('challenge が無い・不正な形式なら失敗として数えない', async () => {
		const user = await createUser();
		for (const challengeId of ['x', '00000000-0000-4000-8000-000000000000']) {
			const { status, res } = await call({ username: user.username, challengeId, emailCode: 'y' }, US_IP);
			expect(status).toBe(403);
			expect(res.error.id).toBe(LOGIN_CHALLENGE_EXPIRED);
		}
		expect(await redis.get(`loginRisk:fail:user:${user.id}`)).toBeNull();
		expect(await signinsRepository.countBy({ userId: user.id })).toBe(0);
	});

	it('IP プレフィックスが変わると照合できない', async () => {
		const user = await createUser();
		await seedKnownEnvironment(user);
		const { challengeId, code } = await requestChallenge(user);
		const { res } = await call({ username: user.username, challengeId, emailCode: code }, '198.51.101.5');
		expect(res.error.id).toBe(LOGIN_CHALLENGE_INVALID);
	});

	it('誤コード5回で TOO_MANY_ATTEMPTS、その後 expired', async () => {
		const user = await createUser();
		await seedKnownEnvironment(user);
		const { challengeId, code } = await requestChallenge(user);
		const wrong = code === '000000' ? '000001' : '000000';

		for (let i = 0; i < 4; i++) {
			const { status, res } = await call({ username: user.username, challengeId, emailCode: wrong }, US_IP);
			expect(status).toBe(403);
			expect(res.error.id).toBe(LOGIN_CHALLENGE_INVALID);
		}
		const fifth = await call({ username: user.username, challengeId, emailCode: wrong }, US_IP);
		expect(fifth.res.error.id).toBe(LOGIN_CHALLENGE_TOO_MANY_ATTEMPTS);

		const after = await call({ username: user.username, challengeId, emailCode: code }, US_IP);
		expect(after.res.error.id).toBe(LOGIN_CHALLENGE_EXPIRED);

		expect(await signinsRepository.countBy({ userId: user.id, challenge: 'failed', success: false })).toBe(5);
		// 誤コードは失敗として数える
		expect(Number(await redis.get(`loginRisk:fail:user:${user.id}`))).toBe(5);
	});

	it('4回目の発行は RATE_LIMITED', async () => {
		const user = await createUser();
		await seedKnownEnvironment(user);
		for (let i = 0; i < 3; i++) {
			await requestChallenge(user);
		}
		const sentBefore = fakeEmail.sent.length;
		const { status, res } = await call({ username: user.username, password: PASSWORD }, US_IP);
		expect(status).toBe(403);
		expect(res.error.id).toBe(LOGIN_CHALLENGE_RATE_LIMITED);
		expect(res.i).toBeUndefined();
		// 本人には通知が届く(確認コードは載せない)
		expect(fakeEmail.sent.length).toBe(sentBefore + 1);
		expect(fakeEmail.last.text).not.toMatch(/\b\d{6}\b/);
		expect(await signinsRepository.countBy({ userId: user.id, challenge: 'emailCode' })).toBe(4);
	});

	it('TOTP 通過済みなら stepUp でも finished:true(通知のみ)', async () => {
		const user = await createUser({ twoFactorEnabled: true });
		await seedKnownEnvironment(user);
		vi.spyOn(userAuthService, 'twoFactorAuthenticate').mockResolvedValue();
		const { res } = await call({ username: user.username, password: PASSWORD, token: '123456' }, US_IP);
		expect(res.finished).toBe(true);
		expect(typeof res.deviceToken).toBe('string');
		await vi.waitFor(() => expect(fakeEmail.sent.some(e => e.subject.startsWith('New login'))).toBe(true));
		expect(fakeEmail.sent.some(e => e.subject.startsWith('Login verification code'))).toBe(false);
	});

	it('メールなし+フラグ有効: finished:true かつ suspiciousLoginDetectedAt がセットされる', async () => {
		meta.loginRiskFlagUnverifiedUsers = true;
		const user = await createUser({ email: null });
		await seedKnownEnvironment(user);
		const { res } = await call({ username: user.username, password: PASSWORD }, US_IP);
		expect(res.finished).toBe(true);
		// 確認できていないログインは学習しない
		expect(res.deviceToken).toBeUndefined();
		const updated = await usersRepository.findOneByOrFail({ id: user.id });
		expect(updated.suspiciousLoginDetectedAt).not.toBeNull();
	});

	it('メールなし+フラグ無効: suspiciousLoginDetectedAt は null のまま', async () => {
		const user = await createUser({ email: null });
		await seedKnownEnvironment(user);
		const { res } = await call({ username: user.username, password: PASSWORD }, US_IP);
		expect(res.finished).toBe(true);
		const updated = await usersRepository.findOneByOrFail({ id: user.id });
		expect(updated.suspiciousLoginDetectedAt).toBeNull();
	});

	it('enableEmail=false はメールなし扱い', async () => {
		meta.enableEmail = false;
		meta.loginRiskFlagUnverifiedUsers = true;
		const user = await createUser();
		await seedKnownEnvironment(user);
		const { res } = await call({ username: user.username, password: PASSWORD }, US_IP);
		expect(res.finished).toBe(true);
		expect(fakeEmail.sent.some(e => e.subject.startsWith('Login verification code'))).toBe(false);
		const updated = await usersRepository.findOneByOrFail({ id: user.id });
		expect(updated.suspiciousLoginDetectedAt).not.toBeNull();
	});

	it('確認コードを通過すると suspiciousLoginDetectedAt が消える', async () => {
		const user = await createUser();
		await usersRepository.update(user.id, { suspiciousLoginDetectedAt: new Date() });
		await seedKnownEnvironment(user);
		const { challengeId, code } = await requestChallenge(user);
		const { res } = await call({ username: user.username, challengeId, emailCode: code }, US_IP);
		expect(res.finished).toBe(true);
		const updated = await usersRepository.findOneByOrFail({ id: user.id });
		expect(updated.suspiciousLoginDetectedAt).toBeNull();
	});

	it('レスポンスに score / reasons を含まない', async () => {
		const user = await createUser();
		const deviceToken = await seedKnownEnvironment(user);
		const stepUp = await call({ username: user.username, password: PASSWORD }, US_IP);
		expect(JSON.stringify(stepUp.res)).not.toMatch(/reasons|score/);
		const allow = await call({ username: user.username, password: PASSWORD, deviceToken }, JP_IP);
		expect(JSON.stringify(allow.res)).not.toMatch(/reasons|score/);
	});

	it('既知環境のログインでは成功メールを送らない', async () => {
		const user = await createUser();
		const deviceToken = await seedKnownEnvironment(user);
		const { res } = await call({ username: user.username, password: PASSWORD, deviceToken }, JP_IP);
		expect(res.finished).toBe(true);
		await vi.waitFor(async () => expect(await signinsRepository.countBy({ userId: user.id, success: true })).toBe(4));
		expect(fakeEmail.sent).toHaveLength(0);
	});

	it('誤パスワードは失敗として数える', async () => {
		const user = await createUser();
		const { status, res } = await call({ username: user.username, password: 'wrong' }, US_IP);
		expect(status).toBe(403);
		expect(res.error.id).toBe('932c904e-9460-45b7-9ce6-7ed33be7eb2c');
		expect(Number(await redis.get(`loginRisk:fail:user:${user.id}`))).toBe(1);
	});

	it('成功メールの name と UA は HTML エスケープされ、cookie ヘッダは含まれない', async () => {
		meta.enableLoginRiskDetection = false;
		const user = await createUser({ name: '<b>x</b>' });
		const { res } = await call({ username: user.username, password: PASSWORD }, US_IP, { cookie: 'secret', authorization: 'Bearer secret', 'user-agent': '<img>' });
		expect(res.finished).toBe(true);

		await vi.waitFor(() => expect(fakeEmail.sent.some(e => e.subject.startsWith('New login'))).toBe(true));
		const mail = fakeEmail.sent.find(e => e.subject.startsWith('New login'))!;
		expect(mail.html).toContain('&lt;b&gt;x&lt;/b&gt;');
		expect(mail.html).toContain('&lt;img&gt;');
		expect(mail.html).not.toContain('<b>x</b>');
		expect(mail.html).not.toContain('<img>');
		expect(mail.html).not.toContain('secret');
		expect(mail.text).not.toContain('secret');

		await vi.waitFor(async () => expect(await signinsRepository.countBy({ userId: user.id, success: true })).toBe(1));
		const row = await signinsRepository.findOneByOrFail({ userId: user.id, success: true });
		expect(row.headers).not.toHaveProperty('cookie');
		expect(row.headers).not.toHaveProperty('authorization');
		expect(row.headers['user-agent']).toBe('<img>');
	});
});
