/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import * as crypto from 'node:crypto';
import * as net from 'node:net';
import { Redis } from 'ioredis';
import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { MiUserSsoLink, MiSignin, MiUser, MiUserProfile, MiUserLoginContext, MiUserSecurityKey } from '@/models/_.js';
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
	async function exchange(body: Record<string, unknown>, cookie?: string, clientIp?: string) {
		await sleep(1100);
		const res = await fetch(`http://127.0.0.1:${port}/api/sso/exchange-code`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...(clientIp != null ? { 'x-forwarded-for': clientIp } : {}), ...(cookie != null ? { cookie: `sso_binding=${cookie}` } : {}) },
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

		const initialRevision = (await api('admin/meta', {}, admin)).body.ssoProvidersRevision;
		const meta = await api('admin/update-meta', {
			ssoProvidersRevision: initialRevision,
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
		const finalRevision = (await api('admin/meta', {}, admin)).body.ssoProvidersRevision;
		await api('admin/update-meta', { ssoProvidersRevision: finalRevision, ssoProviders: [] }, admin);
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

	test('古い一覧からの保存は 409 で止まり、並列の保存でも片方の変更だけが残り、秘密も上書きされない', async () => {
		const getRevision = async () => (await api('admin/meta', {}, admin)).body.ssoProvidersRevision as string;
		const getList = async () => (await api('admin/meta', {}, admin)).body.ssoProviders as any[];
		const row = async () => (await db.query('SELECT "ssoProviders" FROM "meta" ORDER BY "id" DESC LIMIT 1'))[0].ssoProviders as any[];
		const entry = (over: Record<string, unknown>) => ({ key: providerKey, type: 'oidc', clientId: 'cid', clientSecret: '', issuerUrl: 'https://idp.invalid', enabled: true, trustUpstreamMfa: false, ...over } as any);

		// 同じ版から同時に 2 件保存する: 片方だけ成功し、もう片方は 409 で、成功した方の変更が残る
		const r0 = await getRevision();
		const [a, b] = await Promise.all([
			api('admin/update-meta', { ssoProvidersRevision: r0, ssoProviders: [entry({ buttonLabel: 'A' })] }, admin),
			api('admin/update-meta', { ssoProvidersRevision: r0, ssoProviders: [entry({ buttonLabel: 'B' })] }, admin),
		]);
		assert.deepStrictEqual([a.status, b.status].sort(), [204, 409]);
		const loser = a.status === 204 ? b : a;
		assert.strictEqual((loser.body as any).error.code, 'SSO_PROVIDERS_CONFLICT');
		assert.strictEqual((await getList())[0].buttonLabel, a.status === 204 ? 'A' : 'B');

		// 古い版での保存は変更を加えずに 409
		const stale = await api('admin/update-meta', { ssoProvidersRevision: r0, ssoProviders: [entry({ buttonLabel: 'C' })] }, admin);
		assert.strictEqual(stale.status, 409);
		assert.strictEqual((await getList())[0].buttonLabel, a.status === 204 ? 'A' : 'B');

		// 版を付けない保存も受け付けない
		const noRevision = await api('admin/update-meta', { ssoProviders: [entry({ buttonLabel: 'D' })] } as any, admin);
		assert.strictEqual(noRevision.status, 409);

		// 別の管理者が秘密を更新した後に、古い版で別の秘密を送っても上書きされない
		const r1 = await getRevision();
		const rotated = await api('admin/update-meta', { ssoProvidersRevision: r1, ssoProviders: [entry({ clientSecret: 'secret-new' })] }, admin);
		assert.strictEqual(rotated.status, 204);
		const overwrite = await api('admin/update-meta', { ssoProvidersRevision: r1, ssoProviders: [entry({ clientSecret: 'secret-stale' })] }, admin);
		assert.strictEqual(overwrite.status, 409);
		assert.strictEqual((await row())[0].clientSecret, 'secret-new');
		assert.notStrictEqual(await getRevision(), r1, '秘密を変えたら版も変わる');

		// rev を持たない旧状態の設定 (版の導入前に保存されたもの) からでも、現在の版で初回の保存ができ、以後は rev が付く
		await db.query('UPDATE "meta" SET "ssoProviders" = (SELECT jsonb_agg(elem - \'rev\') FROM jsonb_array_elements("ssoProviders") elem)');
		assert.strictEqual((await row())[0].rev, undefined);
		const legacyRevision = await getRevision();
		const first = await api('admin/update-meta', { ssoProvidersRevision: legacyRevision, ssoProviders: [entry({ clientSecret: '' })] }, admin);
		assert.strictEqual(first.status, 204);
		assert.strictEqual((await row())[0].clientSecret, 'secret-new');
		assert.strictEqual(typeof (await row())[0].rev, 'string');
		assert.notStrictEqual(await getRevision(), legacyRevision);

		// 監査ログには clientSecret も rev 由来の秘密も残らない
		const logs = await api('admin/show-moderation-logs', { limit: 20 }, admin);
		assert.strictEqual(logs.status, 200);
		assert.ok(!JSON.stringify(logs.body).includes('secret-new'));
		assert.ok(!JSON.stringify(logs.body).includes('secret-stale'));

		// 版が最新で秘密を空欄にすれば保持される (既存の挙動)
		const keep = await api('admin/update-meta', { ssoProvidersRevision: await getRevision(), ssoProviders: [entry({ clientSecret: '' })] }, admin);
		assert.strictEqual(keep.status, 204);
		assert.strictEqual((await row())[0].clientSecret, 'secret-new');
	});

	test('ログイン開始に失敗したら、JSON を見せずにエラー画面へリダイレクトする', async () => {
		await sleep(1100);
		const res = await fetch(`http://127.0.0.1:${port}/api/sso/initiate?provider=no-such-provider`, { redirect: 'manual' });
		assert.ok(res.status >= 300 && res.status < 400, `リダイレクトされるべき: ${res.status}`);
		assert.ok(res.headers.get('location')?.includes('/sso/callback?sso_error='), String(res.headers.get('location')));
	});

	test('コールバックの失敗時は、ログイン用 (HttpOnly) と連携用の束縛 Cookie をどちらも属性つきで削除する', async () => {
		await sleep(1100);
		const res = await fetch(`http://127.0.0.1:${port}/api/sso/callback/${providerKey}?code=x&state=unknown-state`, {
			redirect: 'manual',
			headers: { cookie: 'sso_binding=stale-login; sso_link_binding=stale-link' },
		});
		assert.ok(res.status >= 300 && res.status < 400, `リダイレクトされるべき: ${res.status}`);
		assert.ok(res.headers.get('location')?.includes('sso_error=INVALID_STATE'));

		const cookies = res.headers.getSetCookie();
		const login = cookies.find(c => c.startsWith('sso_binding='));
		const link = cookies.find(c => c.startsWith('sso_link_binding='));
		assert.ok(login != null && link != null, `両方の Cookie を削除するべき: ${JSON.stringify(cookies)}`);
		for (const c of [login, link]) {
			assert.ok(c.includes('Max-Age=0') && c.includes('Path=/api/sso') && c.includes('SameSite=Lax'), c);
		}
		// ログイン用はスクリプトから読み書きできない HttpOnly、連携用はフロントエンドが設定するので HttpOnly ではない
		assert.ok(login.includes('HttpOnly'), login);
		assert.ok(!link.includes('HttpOnly'), link);
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

	// 確認コードのメールを受け取るだけの最小の SMTP サーバー。本文から 6 桁のコードを取り出す
	async function startMailSink() {
		const mails: string[] = [];
		const sockets = new Set<net.Socket>();
		const server = net.createServer(socket => {
			sockets.add(socket);
			socket.on('close', () => sockets.delete(socket));
			let inData = false;
			let buf = '';
			let data = '';
			socket.write('220 localhost ESMTP\r\n');
			socket.on('data', chunk => {
				buf += chunk.toString('latin1');
				for (;;) {
					if (inData) {
						// 終端 (CRLF.CRLF) がチャンクの境目で分かれても見つけられるよう、溜めた全体から探す
						data += buf;
						buf = '';
						const end = data.indexOf('\r\n.\r\n');
						if (end < 0) break;
						mails.push(data.slice(0, end));
						buf = data.slice(end + 5);
						data = '';
						inData = false;
						socket.write('250 OK\r\n');
						continue;
					}
					const nl = buf.indexOf('\r\n');
					if (nl < 0) break;
					const line = buf.slice(0, nl);
					buf = buf.slice(nl + 2);
					const cmd = line.slice(0, 4).toUpperCase();
					if (cmd === 'DATA') { inData = true; socket.write('354 go ahead\r\n'); }
					else if (cmd === 'QUIT') { socket.write('221 bye\r\n'); socket.end(); }
					else socket.write('250 OK\r\n');
				}
			});
			socket.on('error', () => {});
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const decode = (raw: string) => {
			// Content-Transfer-Encoding ごとに本文を戻して、コードの行を探す
			const parts = raw.split(/\r\n\r\n/);
			const texts = [raw];
			for (let i = 1; i < parts.length; i++) {
				const head = parts[i - 1].toLowerCase();
				if (head.includes('content-transfer-encoding: base64')) texts.push(Buffer.from(parts[i].replace(/[^A-Za-z0-9+/=]/g, ''), 'base64').toString('utf8'));
				else if (head.includes('content-transfer-encoding: quoted-printable')) texts.push(parts[i].replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
			}
			return texts;
		};
		return {
			port: (server.address() as net.AddressInfo).port,
			mails,
			async waitForCode(): Promise<string> {
				for (let i = 0; i < 50; i++) {
					for (const raw of mails) {
						for (const t of decode(raw)) {
							const m = t.match(/code: (?:<b>)?(\d{6})/);
							if (m) return m[1];
						}
					}
					await sleep(100);
				}
				throw new Error('確認コードのメールが届かなかった');
			},
			// 接続が残っていると close が終わらないので、残りは切る
			close: () => new Promise<void>(resolve => { server.close(() => resolve()); for (const sock of sockets) sock.destroy(); }),
		};
	}

	test('リスクが高い SSO ログインはメールの確認コードを要求し、誤りでは Cookie を残し、正しいコードで確定する', async () => {
		const user = await signup({ username: 'ssoex_email' });
		await linkUser(user.id, 'sub-email');
		await db.getRepository(MiUserProfile).update({ userId: user.id }, { email: 'ssoex_email@example.com', emailVerified: true });
		// 学習期間 (3 回) を過ぎた状態にする。公開 IP のログインは必ず prefix を記録する
		await db.getRepository(MiUserLoginContext).insert({ id: crypto.randomBytes(8).toString('hex'), userId: user.id, kind: 'prefix', value: 'seed', firstSeenAt: new Date(), lastSeenAt: new Date(), hits: 3 });
		// 端末が 1 件も記録されていないユーザーには newDevice を付けない仕様なので、別の既知の端末を 1 件用意する (今回の端末は未知になる)
		await db.getRepository(MiUserLoginContext).insert({ id: crypto.randomBytes(8).toString('hex'), userId: user.id, kind: 'device', value: 'seed-device', firstSeenAt: new Date(), lastSeenAt: new Date(), hits: 1 });

		const sink = await startMailSink();
		const clientIp = '93.184.216.34';
		try {
			const on = await api('admin/update-meta', { enableEmail: true, smtpHost: '127.0.0.1', smtpPort: sink.port, smtpSecure: false, smtpUser: '', enableLoginRiskDetection: true, loginRiskNotifyThreshold: 1, loginRiskStepUpThreshold: 20 }, admin);
			assert.strictEqual(on.status, 204);

			const binding = 'binding-email';
			const code = await issueLoginCode(user.id, 'sub-email', binding);

			// 新しい端末なので確認コードが要る。ログインコードは確定まで消費されず、Cookie は延長される
			const first = await exchange({ code }, binding, clientIp);
			// 失敗したときに、判定がどうなったかが分かるよう、記録されたサインインを添える
			const diag = JSON.stringify((await db.getRepository(MiSignin).find({ where: { userId: user.id }, order: { id: 'DESC' }, take: 3 })).map(r => ({ ip: r.ip, success: r.success, score: r.riskScore, reasons: r.riskReasons, challenge: r.challenge })));
			assert.strictEqual(first.status, 200, diag);
			assert.strictEqual(first.body.finished, false, `リスク判定でコードが要求されなかった: ${diag}`);
			assert.strictEqual(first.body.next, 'emailCode');
			assert.ok(typeof first.body.challengeId === 'string');
			assert.ok(first.setCookie?.includes('Max-Age=') && !first.setCookie.includes('Max-Age=0'), `Cookie は削除されないべき: ${first.setCookie}`);
			assert.strictEqual(await codeExists(code), true);

			const emailCode = await sink.waitForCode();
			const wrongCode = emailCode === '000000' ? '111111' : '000000';

			// 誤ったコード: 403、Cookie は削除されず、ログインコードは残り、失敗が数えられる
			const wrong = await exchange({ code, challengeId: first.body.challengeId, emailCode: wrongCode }, binding, clientIp);
			assert.strictEqual(wrong.status, 403);
			assert.ok(!wrong.setCookie?.includes('Max-Age=0'), `失敗で Cookie を削除しない: ${wrong.setCookie}`);
			assert.strictEqual(await codeExists(code), true);
			assert.strictEqual(await redis.get(`sso:loginCodeAttempts:${code}`), '1');

			// 別のブラウザ (束縛 Cookie が違う) からは、正しいコードでも確定できない
			const otherBrowser = await exchange({ code, challengeId: first.body.challengeId, emailCode }, 'binding-other', clientIp);
			assert.strictEqual(otherBrowser.status, 400);
			assert.strictEqual(await codeExists(code), true);

			// 同じコード・同じ Cookie・同じネットワークで正しい確認コードを送ればログインできる
			const ok = await exchange({ code, challengeId: first.body.challengeId, emailCode }, binding, clientIp);
			assert.strictEqual(ok.status, 200);
			assert.strictEqual(ok.body.finished, true);
			assert.ok(ok.setCookie?.includes('Max-Age=0'), `確定したら Cookie を削除するべき: ${ok.setCookie}`);
			assert.strictEqual(await codeExists(code), false);

			// 使い終わった確認コードは再利用できない
			const code2 = await issueLoginCode(user.id, 'sub-email', binding);
			const reuse = await exchange({ code: code2, challengeId: first.body.challengeId, emailCode }, binding, clientIp);
			assert.strictEqual(reuse.status, 403);
			assert.strictEqual(await codeExists(code2), true);
		} finally {
			await api('admin/update-meta', { enableEmail: false, enableLoginRiskDetection: false, loginRiskNotifyThreshold: 30, loginRiskStepUpThreshold: 60 }, admin);
			await sink.close();
		}
	}, 1000 * 60);

	test('セキュリティキーを登録した 2FA 有効なアカウントはパスキー確認を求められ、不正な応答は失敗として数えて Cookie を残す', async () => {
		const user = await signup({ username: 'ssoex_passkey' });
		await linkUser(user.id, 'sub-passkey');
		const reg = await api('i/2fa/register', { password: 'test' }, user);
		assert.strictEqual(reg.status, 200);
		assert.strictEqual((await api('i/2fa/done', { token: otp(reg.body.secret) }, user)).status, 200);
		// 本物の認証器の応答は作れないので、登録済みのキーだけを DB に用意する (検証に成功する経路はここでは扱わない)
		await db.getRepository(MiUserSecurityKey).insert({ id: 'ssoex-passkey-credential', userId: user.id, name: 'e2e', publicKey: 'AAAA', counter: 0, lastUsed: new Date(), credentialDeviceType: 'singleDevice', credentialBackedUp: false, transports: [] });

		const binding = 'binding-passkey';
		const code = await issueLoginCode(user.id, 'sub-passkey', binding);

		// TOTP ではなくパスキー確認を求め、チャレンジを返す。ログインコードは残り、Cookie は延長される
		const first = await exchange({ code }, binding);
		assert.strictEqual(first.status, 200);
		assert.strictEqual(first.body.finished, false);
		assert.strictEqual(first.body.next, 'passkey');
		assert.strictEqual(typeof first.body.authRequest?.challenge, 'string');
		assert.ok(first.setCookie?.includes('Max-Age=600'), `Cookie は延長されるべき: ${first.setCookie}`);
		assert.strictEqual(await codeExists(code), true);

		// 登録されていないキーの応答: 403、失敗が数えられサインイン履歴に残り、Cookie は削除されず、コードも残る
		const bogus = { id: 'unknown-credential', rawId: 'unknown-credential', type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: 'e30', authenticatorData: 'AAAA', signature: 'AAAA' } };
		const wrong = await exchange({ code, credential: bogus }, binding);
		assert.strictEqual(wrong.status, 403);
		assert.strictEqual(wrong.body.error.code, 'TWO_FACTOR_AUTH_FAILED');
		assert.ok(wrong.setCookie?.includes('Max-Age=600') && !wrong.setCookie.includes('Max-Age=0'), `失敗でも Cookie は削除されない: ${wrong.setCookie}`);
		assert.strictEqual(await codeExists(code), true);
		assert.strictEqual(await redis.get(`sso:loginCodeAttempts:${code}`), '1');
		assert.ok(await db.getRepository(MiSignin).countBy({ userId: user.id, success: false }) >= 1, '失敗がサインイン履歴に残るべき');

		// パスキー確認を出さずにログインコードだけで完了させることはできない
		const again = await exchange({ code }, binding);
		assert.strictEqual(again.body.finished, false);
		assert.strictEqual(again.body.next, 'passkey');
	});

	test('連携済みのプロバイダーは、発行者・種類の変更と、削除後の同じ key での再登録を 409 で拒否する', async () => {
		const getRevision = async () => (await api('admin/meta', {}, admin)).body.ssoProvidersRevision as string;
		const getList = async () => (await api('admin/meta', {}, admin)).body.ssoProviders as any[];
		const entry = (over: Record<string, unknown>) => ({ key: providerKey, type: 'oidc', clientId: 'cid', clientSecret: '', issuerUrl: 'https://idp.invalid', enabled: true, trustUpstreamMfa: false, ...over } as any);
		const save = async (providers: any[]) => await api('admin/update-meta', { ssoProvidersRevision: await getRevision(), ssoProviders: providers }, admin);
		assert.ok(await db.getRepository(MiUserSsoLink).countBy({ provider: providerKey }) > 0, '連携が残っているはず');

		// 発行者の変更
		const issuer = await save([entry({ issuerUrl: 'https://other-idp.invalid' })]);
		assert.strictEqual(issuer.status, 409);
		assert.strictEqual((issuer.body as any).error.code, 'SSO_PROVIDER_LINKED');
		assert.strictEqual((await getList())[0].issuerUrl, 'https://idp.invalid');

		// 種類の変更
		const type = await save([entry({ type: 'github', issuerUrl: null })]);
		assert.strictEqual(type.status, 409);
		assert.strictEqual((type.body as any).error.code, 'SSO_PROVIDER_LINKED');
		assert.strictEqual((await getList())[0].type, 'oidc');

		// 連携が残っていても、発行者を変えない通常の保存は通る
		assert.strictEqual((await save([entry({ buttonLabel: 'ok' })])).status, 204);

		// 削除はできるが、連携が残っている間は同じ key で別の発行者を登録できない
		assert.strictEqual((await save([])).status, 204);
		const reuse = await save([entry({ issuerUrl: 'https://other-idp.invalid' })]);
		assert.strictEqual(reuse.status, 409);
		assert.strictEqual((reuse.body as any).error.code, 'SSO_PROVIDER_LINKED');
		assert.deepStrictEqual(await getList(), []);
	});

	test('clientId を変えると、確認なしでは 409 で止まり、確認すると連携が解除されて対象ユーザーに通知される', async () => {
		const key = 'e2eunlink';
		const victim = await signup({ username: 'ssoex_unlink' });
		const bystander = await signup({ username: 'ssoex_unlink_other' });
		const getRevision = async () => (await api('admin/meta', {}, admin)).body.ssoProvidersRevision as string;
		const entry = (over: Record<string, unknown>) => ({ key, type: 'oidc', clientId: 'cid-a', clientSecret: 'secret-a', issuerUrl: 'https://idp.invalid', enabled: true, trustUpstreamMfa: false, ...over } as any);
		const save = async (providers: any[]) => await api('admin/update-meta', { ssoProvidersRevision: await getRevision(), ssoProviders: providers }, admin);
		const links = async () => await db.getRepository(MiUserSsoLink).countBy({ provider: key });
		const notified = async (user: { id: string }, token: misskey.entities.SignupResponse) => ((await api('i/notifications', {}, token)).body as any[]).filter(n => n.type === 'app' && String(n.body).includes(key));

		// 最初の登録: 連携はあるが、clientId を変えるわけではないので通る
		// (連携のないプロバイダーを先に登録し、そのあとで連携を作る。連携の残る key の新規登録は別の規則で拒否される)
		assert.strictEqual((await save([entry({})])).status, 204);
		await db.getRepository(MiUserSsoLink).insert({ id: crypto.randomBytes(8).toString('hex'), userId: victim.id, provider: key, providerIssuer: 'oidc:https://idp.invalid', providerUserId: 'sub-unlink', createdAt: new Date() });
		assert.strictEqual(await links(), 1);

		// clientId を変えるが確認のフラグがない: 409、連携は残り、clientId も変わらず、通知も来ない
		const refused = await save([entry({ clientId: 'cid-b', clientSecret: '' })]);
		assert.strictEqual(refused.status, 409);
		assert.strictEqual((refused.body as any).error.code, 'SSO_CLIENT_ID_CHANGE_NEEDS_UNLINK');
		assert.strictEqual(await links(), 1);
		assert.strictEqual(((await api('admin/meta', {}, admin)).body.ssoProviders as any[]).find(p => p.key === key).clientId, 'cid-a');
		assert.strictEqual((await notified(victim, victim)).length, 0);

		// clientId を変えない保存にはフラグがあっても何も起きない
		assert.strictEqual((await save([entry({ clientSecret: '', unlinkExistingOnClientIdChange: true })])).status, 204);
		assert.strictEqual(await links(), 1);

		// 確認のフラグつき: 保存と解除が一緒に行われ、解除された本人にだけ通知が届く
		const ok = await save([entry({ clientId: 'cid-b', clientSecret: '', unlinkExistingOnClientIdChange: true })]);
		assert.strictEqual(ok.status, 204);
		assert.strictEqual(await links(), 0);
		assert.strictEqual(((await api('admin/meta', {}, admin)).body.ssoProviders as any[]).find(p => p.key === key).clientId, 'cid-b');
		let mine: any[] = [];
		for (let i = 0; i < 20 && mine.length === 0; i++) {
			mine = await notified(victim, victim);
			if (mine.length === 0) await sleep(500);
		}
		assert.strictEqual(mine.length, 1);
		assert.strictEqual((await notified(bystander, bystander)).length, 0);
		// 通知に clientId や secret は含まれない
		assert.ok(!/cid-|secret-/.test(String(mine[0].body)));
	});
});
