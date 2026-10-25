/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import * as crypto from 'node:crypto';
import { Redis } from 'ioredis';
import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { MiUserSsoLink, MiSignin, MiUser } from '@/models/_.js';
import { api, createAppToken, initTestDb, port, sendEnvUpdateRequest, signup } from '../utils.js';
import type { DataSource } from 'typeorm';
import type * as misskey from 'misskey-js';

// SSO のログインコード交換 (/api/sso/exchange-code) を実サーバーで確認する。
// IdP とのやり取り (コールバック) は実 IdP が要るため対象外で、コールバック後に Redis へ保存される
// ログインコードと同じ形のデータを直接用意して、交換の HTTP 層 (束縛 Cookie・追加認証の失敗・状態) を検証する。
describe('SSO ログインコードの交換 (束縛 Cookie)', () => {
	const config = loadConfig();
	const providerKey = 'e2eidp';
	let admin: misskey.entities.SignupResponse;
	let plain: misskey.entities.SignupResponse;
	let totpUser: misskey.entities.SignupResponse;
	let totpSecret: string;
	let redis: Redis;
	let db: DataSource;

	const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
	const otp = (secret: string) => OTPAuth.TOTP.generate({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6 });
	const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

	async function linkUser(userId: string, subject: string, issuer = 'oidc:https://idp.invalid') {
		await db.getRepository(MiUserSsoLink).insert({
			id: crypto.randomBytes(8).toString('hex'),
			userId,
			provider: providerKey,
			providerIssuer: issuer,
			providerUserId: subject,
			createdAt: new Date(),
		});
	}

	// コールバックが保存するのと同じ形のログインコードを用意する
	async function issueLoginCode(userId: string, subject: string, binding: string) {
		const code = crypto.randomBytes(16).toString('hex');
		await redis.set(`sso:loginCode:${code}`, JSON.stringify({ userId, provider: providerKey, subject, bindingHash: sha256(binding) }), 'EX', 120);
		return code;
	}

	// 交換は 1 秒の最小間隔制限があるため、連続呼び出しの間隔を空ける
	async function exchange(body: Record<string, unknown>, cookie?: string) {
		await sleep(1100);
		const res = await fetch(`http://127.0.0.1:${port}/api/sso/exchange-code`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...(cookie != null ? { cookie: `sso_binding=${cookie}` } : {}) },
			body: JSON.stringify(body),
		});
		// 同じ Cookie の延長と削除が両方付くことがあるので、ブラウザが最終的に採用する最後の指定を見る
		const setCookie = res.headers.getSetCookie().filter(c => c.startsWith('sso_binding=')).at(-1) ?? null;
		return { status: res.status, body: await res.json() as any, setCookie };
	}

	const codeExists = async (code: string) => (await redis.exists(`sso:loginCode:${code}`)) === 1;

	beforeAll(async () => {
		redis = new Redis(config.redis);
		db = await initTestDb(true);
		// 最初のサインアップユーザーは管理者になる
		admin = await signup({ username: 'admin_ssoex' });
		plain = await signup({ username: 'ssoex_plain' });
		totpUser = await signup({ username: 'ssoex_totp' });

		const meta = await api('admin/update-meta', {
			ssoProviders: [{ key: providerKey, type: 'oidc', clientId: 'cid', clientSecret: 'csecret', issuerUrl: 'https://idp.invalid', enabled: true, trustUpstreamMfa: false }],
		}, admin);
		assert.strictEqual(meta.status, 204, 'SSO プロバイダーの用意に失敗');

		const reg = await api('i/2fa/register', { password: 'test' }, totpUser);
		assert.strictEqual(reg.status, 200);
		totpSecret = reg.body.secret;
		const done = await api('i/2fa/done', { token: otp(totpSecret) }, totpUser);
		assert.strictEqual(done.status, 200);

		await linkUser(plain.id, 'sub-plain');
		await linkUser(totpUser.id, 'sub-totp');
	}, 1000 * 60 * 2);

	afterAll(async () => {
		await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_DUPLICATED_TOTP', value: '' });
		await db.getRepository(MiUserSsoLink).delete({ provider: providerKey });
		await api('admin/update-meta', { ssoProviders: [] }, admin);
		await db.destroy();
		redis.disconnect();
	});

	test('束縛 Cookie が無い・違うブラウザからの交換は拒否し、ログインコードは消費しない', async () => {
		const code = await issueLoginCode(plain.id, 'sub-plain', 'binding-a');

		const none = await exchange({ code });
		assert.strictEqual(none.status, 400);
		assert.strictEqual(none.body.error.code, 'INVALID_CODE');

		const other = await exchange({ code }, 'binding-b');
		assert.strictEqual(other.status, 400);
		assert.strictEqual(other.body.error.code, 'INVALID_CODE');

		assert.strictEqual(await codeExists(code), true);
	});

	test('束縛値のないログインコードは受け付けない', async () => {
		const code = crypto.randomBytes(16).toString('hex');
		await redis.set(`sso:loginCode:${code}`, JSON.stringify({ userId: plain.id, provider: providerKey, subject: 'sub-plain' }), 'EX', 120);
		const res = await exchange({ code }, 'binding-a');
		assert.strictEqual(res.status, 400);
		assert.strictEqual(await codeExists(code), true);
	});

	test('同じブラウザなら交換でき、ログイン確定で Cookie を削除しコードを消費する', async () => {
		const code = await issueLoginCode(plain.id, 'sub-plain', 'binding-a');
		const res = await exchange({ code }, 'binding-a');
		assert.strictEqual(res.status, 200);
		assert.strictEqual(res.body.finished, true);
		assert.ok(res.setCookie?.includes('Max-Age=0'), `Cookie を削除するべき: ${res.setCookie}`);
		assert.strictEqual(await codeExists(code), false);
	});

	test('連携を作った発行者と現在の発行者が違う連携ではログインコードを受け付けない', async () => {
		const stale = await signup({ username: 'ssoex_stale' });
		await linkUser(stale.id, 'sub-stale', 'oidc:https://old-idp.invalid');
		const code = await issueLoginCode(stale.id, 'sub-stale', 'binding-stale');
		const res = await exchange({ code }, 'binding-stale');
		assert.strictEqual(res.status, 400);
		assert.strictEqual(res.body.error?.code ?? res.body.code, 'INVALID_CODE');
	});

	test('承認待ちのアカウントは、承認必須の設定ならログインコードを受け付けない (パスワードログインと同じ)', async () => {
		const pending = await signup({ username: 'ssoex_pending' });
		await linkUser(pending.id, 'sub-pending');
		await db.getRepository(MiUser).update({ id: pending.id }, { approved: false });
		try {
			const on = await api('admin/update-meta', { approvalRequiredForSignup: true }, admin);
			assert.strictEqual(on.status, 204);
			const code = await issueLoginCode(pending.id, 'sub-pending', 'binding-pending');
			const res = await exchange({ code }, 'binding-pending');
			assert.strictEqual(res.status, 403);
			assert.strictEqual(res.body.error?.code, 'YOUR_ACCOUNT_NOT_APPROVED');
			assert.strictEqual(await codeExists(code), true);
		} finally {
			await api('admin/update-meta', { approvalRequiredForSignup: false }, admin);
		}
	});

	test('追加認証の失敗では Cookie を削除せず、失敗を記録して再試行できる', async () => {
		// テスト環境の TOTP 検証は既定で常に成功するため、実際に検証させる
		await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_DUPLICATED_TOTP', value: '1' });
		const binding = 'binding-totp';
		const code = await issueLoginCode(totpUser.id, 'sub-totp', binding);

		// 追加認証が要るので、Cookie は延長され、コードは残る
		const first = await exchange({ code }, binding);
		assert.strictEqual(first.status, 200);
		assert.deepStrictEqual({ finished: first.body.finished, next: first.body.next }, { finished: false, next: 'totp' });
		assert.ok(first.setCookie?.includes('Max-Age=600'), `Cookie は延長されるべき: ${first.setCookie}`);
		assert.strictEqual(await codeExists(code), true);

		// 誤った TOTP: 403、Cookie は削除されない、コードは残る、失敗が数えられサインイン履歴に残る
		const wrong = await exchange({ code, token: '000000' }, binding);
		assert.strictEqual(wrong.status, 403);
		assert.strictEqual(wrong.body.error.code, 'TWO_FACTOR_AUTH_FAILED');
		assert.ok(wrong.setCookie?.includes('Max-Age=600'), `失敗でも Cookie は削除されない: ${wrong.setCookie}`);
		assert.ok(!wrong.setCookie?.includes('Max-Age=0'));
		assert.strictEqual(await codeExists(code), true);
		assert.strictEqual(await redis.get(`sso:loginCodeAttempts:${code}`), '1');
		const failed = await db.getRepository(MiSignin).countBy({ userId: totpUser.id, success: false });
		assert.ok(failed >= 1, `失敗がサインイン履歴に残るべき: ${failed}`);

		// 同じコード・同じ Cookie で正しい TOTP を送ればログインできる
		const ok = await exchange({ code, token: otp(totpSecret) }, binding);
		assert.strictEqual(ok.status, 200);
		assert.strictEqual(ok.body.finished, true);
		assert.ok(ok.setCookie?.includes('Max-Age=0'));
		assert.strictEqual(await codeExists(code), false);
	});

	test('連携状態は本人のセッションだけが読め、外部IDは返さない (第三者アプリのトークンには出さない)', async () => {
		const res = await api('sso/status', {}, plain);
		assert.strictEqual(res.status, 200);
		assert.deepStrictEqual(res.body.links.map(l => l.provider), [providerKey]);
		assert.ok(!('providerUserId' in res.body.links[0]));

		const appToken = await createAppToken(plain, ['read:account']);
		const viaApp = await api('sso/status', {}, { token: appToken } as any);
		assert.notStrictEqual(viaApp.status, 200);
	});

	test('連携の開始には再認証が必要で、パスワード不一致・2FAトークンなしは拒否する', async () => {
		const noPassword = await api('sso/link', { provider: providerKey } as any, plain);
		assert.strictEqual(noPassword.status, 400);

		const wrongPassword = await api('sso/link', { provider: providerKey, password: 'wrong-password' }, plain);
		assert.strictEqual(wrongPassword.status, 403);

		// 2FA有効なアカウントは、パスワードが正しくてもトークンがなければ拒否する
		const noToken = await api('sso/link', { provider: providerKey, password: 'test' }, totpUser);
		assert.strictEqual(noToken.status, 403);
		const badToken = await api('sso/link', { provider: providerKey, password: 'test', token: '000000' }, totpUser);
		assert.strictEqual(badToken.status, 403);
	});
});
