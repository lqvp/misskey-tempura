/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { escapeHtml } from '@/misc/escape-html.js';
import { getIpPrefix, normalizeIp } from '@/misc/ip-prefix.js';
import { EmailService } from '@/core/EmailService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { LoginRiskEvaluation } from '@/core/LoginRiskService.js';
import { describeLoginLocation } from './SigninService.js';

const CHALLENGE_TTL_SEC = 600;
const MAX_ATTEMPTS = 5;
const ISSUE_WINDOW_SEC = 60 * 60;
const MAX_ISSUES_PER_WINDOW = 3;
const SEND_TIMEOUT_MS = 15_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StoredChallenge = {
	attempts: number;
	userId: MiUser['id'];
	codeHash: string;
	prefixHash: string | null;
	ev: LoginRiskEvaluation;
};

/**
 * 試行回数を1増やす。MAX_ATTEMPTS に達したらキーを消す。
 * 同時に誤コードが送られても数え漏れないよう Redis 上で行う。
 * attempts は JSON の先頭に置いているので、文字列値の中と取り違えない。
 * 戻り値: 増やした後の回数。キーが無ければ -1
 */
const INCREMENT_ATTEMPTS_SCRIPT = `
local v = redis.call('GET', KEYS[1])
if not v then return -1 end
local n = tonumber(string.match(v, '^{"attempts":(%d+)')) + 1
if n >= tonumber(ARGV[1]) then
	redis.call('DEL', KEYS[1])
else
	redis.call('SET', KEYS[1], (string.gsub(v, '^{"attempts":%d+', '{"attempts":' .. n, 1)), 'KEEPTTL')
end
return n
`;

function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class LoginChallengeService {
	private logger: Logger;

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private emailService: EmailService,
		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('login-challenge');
	}

	/**
	 * 確認コードを発行してメールで送る。
	 * 発行上限を超えたら rateLimited、Redis に保存できなければ storeFailed、メールを送れなければ sendFailed
	 */
	@bindThis
	public async issue(p: { user: MiLocalUser; email: string; ev: LoginRiskEvaluation; ip: string }): Promise<{ challengeId: string } | { error: 'rateLimited' | 'storeFailed' | 'sendFailed' }> {
		const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
		const challengeId = randomUUID();
		const issueKey = `loginRisk:challengeIssue:${p.user.id}`;
		const stored: StoredChallenge = {
			attempts: 0,
			userId: p.user.id,
			codeHash: sha256(code),
			prefixHash: this.prefixHash(p.ip),
			ev: p.ev,
		};

		try {
			// 固定の1時間枠で数える。SET NX で初回だけ期限を付ける
			const results = await this.redisClient.multi()
				.set(issueKey, 0, 'EX', ISSUE_WINDOW_SEC, 'NX')
				.incr(issueKey)
				.exec();
			const incr = results?.[1];
			if (incr == null || incr[0] != null) throw incr?.[0] ?? new Error('transaction aborted');
			if (Number(incr[1]) > MAX_ISSUES_PER_WINDOW) return { error: 'rateLimited' };

			await this.redisClient.set(this.challengeKey(challengeId), JSON.stringify(stored), 'EX', CHALLENGE_TTL_SEC);
		} catch (err) {
			this.logger.error(`failed to store login challenge for ${p.user.id}`, { error: err });
			return { error: 'storeFailed' };
		}

		try {
			await this.sendCodeEmail(p.email, code, p.ev);
		} catch (err) {
			// 通してしまうと、SMTP が止まっている間は追加認証を素通りできるので拒否する。
			// 届かなかった発行は上限に数えず、SMTP が直れば本人はすぐやり直せるようにする
			this.logger.error(`failed to send login challenge email for ${p.user.id}`, { error: err });
			await this.redisClient.del(this.challengeKey(challengeId)).catch(() => {});
			await this.redisClient.decr(issueKey).catch(() => {});
			return { error: 'sendFailed' };
		}

		return { challengeId };
	}

	/**
	 * 確認コードを照合する。成功したら challenge を消し、1回しか使えないようにする。
	 * invalid / tooManyAttempts は、このユーザーの challenge に誤ったコードを送ったときだけ返す。
	 * challenge が無い・不正な形式(noChallenge)、他人の challenge(otherUser)は試行に数えない
	 */
	@bindThis
	public async verify(p: { userId: MiUser['id']; challengeId: unknown; code: unknown; ip: string }): Promise<{ ok: true; ev: LoginRiskEvaluation } | { ok: false; reason: 'invalid' | 'tooManyAttempts' | 'noChallenge' | 'otherUser' }> {
		if (typeof p.challengeId !== 'string' || !UUID_RE.test(p.challengeId)) return { ok: false, reason: 'noChallenge' };
		const key = this.challengeKey(p.challengeId);

		try {
			const raw = await this.redisClient.get(key);
			if (raw == null) return { ok: false, reason: 'noChallenge' };
			const stored = JSON.parse(raw) as StoredChallenge;
			// ユーザー名の表記ではなく id で比べる。他人の challenge は消費も試行の加算もしない
			if (stored.userId !== p.userId) return { ok: false, reason: 'otherUser' };

			const codeOk = typeof p.code === 'string' && this.hashEquals(sha256(p.code), stored.codeHash);
			const prefixOk = stored.prefixHash == null || stored.prefixHash === this.prefixHash(p.ip);

			if (!codeOk || !prefixOk) {
				const attempts = Number(await this.redisClient.eval(INCREMENT_ATTEMPTS_SCRIPT, 1, key, MAX_ATTEMPTS));
				if (attempts < 0) return { ok: false, reason: 'noChallenge' };
				if (attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'tooManyAttempts' };
				return { ok: false, reason: 'invalid' };
			}

			// 同時に送られても GETDEL を取れた側だけを通す
			const consumed = await this.redisClient.getdel(key);
			if (consumed == null) return { ok: false, reason: 'noChallenge' };
			const challenge = JSON.parse(consumed) as StoredChallenge;
			return { ok: true, ev: challenge.ev };
		} catch (err) {
			this.logger.error('failed to verify login challenge', { error: err });
			return { ok: false, reason: 'noChallenge' };
		}
	}

	private challengeKey(challengeId: string): string {
		return `loginRisk:challenge:${challengeId}`;
	}

	private prefixHash(ip: string): string | null {
		const normalized = normalizeIp(ip);
		const prefix = normalized != null ? getIpPrefix(normalized) : null;
		return prefix != null ? sha256(prefix) : null;
	}

	private hashEquals(a: string, b: string): boolean {
		const ab = Buffer.from(a, 'hex');
		const bb = Buffer.from(b, 'hex');
		return ab.length === bb.length && timingSafeEqual(ab, bb);
	}

	/** SMTP が応答しないとログインが止まるので、SEND_TIMEOUT_MS で打ち切る */
	private sendCodeEmail(email: string, code: string, ev: LoginRiskEvaluation): Promise<void> {
		const location = describeLoginLocation(ev);
		const date = new Date().toISOString();
		const guide = 'Enter this code to finish signing in. It expires in 10 minutes. If you did not try to sign in, change your password. / ログインを完了するには、このコードを入力してください。有効期限は10分です。心当たりがなければパスワードを変更してください。';

		const sending = this.emailService.sendEmail(email, 'Login verification code / ログイン確認コード',
			`code: <b>${escapeHtml(code)}</b><br>` +
			location.map(l => `${escapeHtml(l)}<br>`).join('') +
			`date: ${escapeHtml(date)}<br>` +
			escapeHtml(guide),
			`code: ${code}\n` +
			location.map(l => `${l}\n`).join('') +
			`date: ${date}\n` +
			guide);

		let timer: NodeJS.Timeout | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error(`sending timed out after ${SEND_TIMEOUT_MS}ms`)), SEND_TIMEOUT_MS);
		});
		// 打ち切った後に送信が失敗しても未処理の reject にしない
		sending.catch(() => {});
		return Promise.race([sending, timeout]).finally(() => clearTimeout(timer));
	}
}
