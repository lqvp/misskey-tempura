/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { MiMeta, SigninsRepository, UserLoginContextsRepository } from '@/models/_.js';
import { MiUserLoginContext } from '@/models/UserLoginContext.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { calculateLoginRisk } from '@/misc/login-risk-score.js';
import type { LoginRiskReason, LoginRiskResult } from '@/misc/login-risk-score.js';
import { getIpPrefix, isPrivateOrLoopbackIp, normalizeIp } from '@/misc/ip-prefix.js';
import { getIpHash } from '@/misc/get-ip-hash.js';
import { IdService } from '@/core/IdService.js';
import { RoleService } from '@/core/RoleService.js';
import { IpIntelligenceService } from '@/core/IpIntelligenceService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { IncomingHttpHeaders } from 'node:http';

export type LoginRiskEvaluation = LoginRiskResult & {
	skipped: false | 'disabled' | 'untrustedIp' | 'error';
	country: string | null;
	asn: number | null;
	asnOrg: string | null;
	/** HMAC(prefix) */
	prefixHash: string | null;
	/** HMAC(token)。トークンが不正なら null */
	deviceTokenHash: string | null;
};

type ContextKind = MiUserLoginContext['kind'];

const DEVICE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const FAILURE_WINDOW_SEC = 60 * 60;
const RECENT_OTHER_COUNTRY_MS = 1000 * 60 * 60 * 2;
const BACKFILL_LIMIT = 50;
const LEARNING_LOGINS = 3;
const DAY_MS = 1000 * 60 * 60 * 24;

function skippedEvaluation(skipped: Exclude<LoginRiskEvaluation['skipped'], false>, reasons: LoginRiskReason[] = []): LoginRiskEvaluation {
	return { skipped, score: 0, level: 'allow', reasons, country: null, asn: null, asnOrg: null, prefixHash: null, deviceTokenHash: null };
}

@Injectable()
export class LoginRiskService {
	private logger: Logger;

	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.signinsRepository)
		private signinsRepository: SigninsRepository,

		@Inject(DI.userLoginContextsRepository)
		private userLoginContextsRepository: UserLoginContextsRepository,

		private idService: IdService,
		private roleService: RoleService,
		private ipIntelligenceService: IpIntelligenceService,
		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('login-risk');
	}

	@bindThis
	public isEnabled(): boolean {
		return this.meta.enableLoginRiskDetection;
	}

	/** 例外を投げない。判定できなければ skipped を付けて allow で返す */
	@bindThis
	public async evaluate(p: { user: MiLocalUser; ip: string; headers: IncomingHttpHeaders; deviceToken: unknown }): Promise<LoginRiskEvaluation> {
		if (!this.isEnabled()) return skippedEvaluation('disabled');

		try {
			const ip = normalizeIp(p.ip);
			if (ip == null || isPrivateOrLoopbackIp(ip)) {
				this.logger.warn(`request.ip looks private or invalid (${p.ip}); check the trustProxy setting. Skipping login risk evaluation.`);
				return skippedEvaluation('untrustedIp', ['untrustedIp']);
			}

			const intel = this.ipIntelligenceService.lookup(ip, p.headers);
			const prefix = getIpPrefix(ip);
			const prefixHash = prefix != null ? this.hmac(prefix) : null;
			const deviceTokenHash = typeof p.deviceToken === 'string' && DEVICE_TOKEN_RE.test(p.deviceToken) ? this.hmac(p.deviceToken) : null;
			const userId = p.user.id;

			await this.backfillIfEmpty(userId);

			const [deviceKnown, countryKnown, asnKnown, prefixKnown, learnedLogins, recentOtherCountry, daysSinceLastSuccess, isPrivileged, accountFailures, ipSprayAccounts] = await Promise.all([
				this.getDeviceKnown(userId, deviceTokenHash),
				this.isKnown(userId, 'country', intel.country),
				this.isKnown(userId, 'asn', intel.asn != null ? String(intel.asn) : null),
				this.isKnown(userId, 'prefix', prefixHash),
				this.countLearnedLogins(userId),
				this.hasRecentOtherCountry(userId, intel.country),
				this.getDaysSinceLastSuccess(userId),
				this.roleService.isModerator(p.user),
				this.redisClient.get(this.userFailureKey(userId)).then(v => Number(v ?? 0)),
				this.redisClient.scard(this.ipFailureKey(ip)),
			]);

			const result = calculateLoginRisk({
				deviceKnown,
				countryKnown,
				asnKnown,
				prefixKnown,
				recentOtherCountry,
				tor: intel.tor,
				spamhausDrop: intel.spamhausDrop,
				datacenter: intel.datacenter,
				vpn: intel.vpn,
				accountFailuresLastHour: accountFailures,
				ipSprayAccountsLastHour: ipSprayAccounts,
				daysSinceLastSuccess,
				isPrivileged,
				learning: learnedLogins < LEARNING_LOGINS,
			}, { notify: this.meta.loginRiskNotifyThreshold, stepUp: this.meta.loginRiskStepUpThreshold });

			return { ...result, skipped: false, country: intel.country, asn: intel.asn, asnOrg: intel.asnOrg, prefixHash, deviceTokenHash };
		} catch (err) {
			this.logger.error('login risk evaluation failed; allowing the login without evaluation', { error: err });
			return skippedEvaluation('error');
		}
	}

	/**
	 * サインアップ直後のログインのように、判定せずに学習だけするときの評価を作る。
	 * 機能が無効、または IP がプライベート・不正なら null
	 */
	@bindThis
	public buildLearnOnlyEvaluation(ip: string, headers: IncomingHttpHeaders): LoginRiskEvaluation | null {
		if (!this.isEnabled()) return null;
		const normalized = normalizeIp(ip);
		if (normalized == null || isPrivateOrLoopbackIp(normalized)) return null;

		const intel = this.ipIntelligenceService.lookup(normalized, headers);
		const prefix = getIpPrefix(normalized);
		return {
			skipped: false,
			score: 0,
			level: 'allow',
			reasons: [],
			country: intel.country,
			asn: intel.asn,
			asnOrg: intel.asnOrg,
			prefixHash: prefix != null ? this.hmac(prefix) : null,
			deviceTokenHash: null,
		};
	}

	/** skipped の評価は学習しない。失敗してもログインは止めないので例外を投げない */
	@bindThis
	public async learn(userId: MiUser['id'], ev: LoginRiskEvaluation): Promise<void> {
		if (ev.skipped !== false) return;

		const entries: { kind: ContextKind; value: string }[] = [];
		if (ev.country != null) entries.push({ kind: 'country', value: ev.country });
		if (ev.asn != null) entries.push({ kind: 'asn', value: String(ev.asn) });
		if (ev.prefixHash != null) entries.push({ kind: 'prefix', value: ev.prefixHash });
		if (ev.deviceTokenHash != null) entries.push({ kind: 'device', value: ev.deviceTokenHash });

		try {
			await this.upsertContexts(userId, entries);
		} catch (err) {
			this.logger.error(`failed to learn login context for ${userId}`, { error: err });
		}
	}

	/** 32バイトの乱数を base64url で返し、そのハッシュを端末として保存する */
	@bindThis
	public async issueDeviceToken(userId: MiUser['id']): Promise<string> {
		const token = randomBytes(32).toString('base64url');
		await this.upsertContexts(userId, [{ kind: 'device', value: this.hmac(token) }]);
		return token;
	}

	/** ログインの失敗を記録する。例外を投げない */
	@bindThis
	public async recordFailure(userId: MiUser['id'], ip: string): Promise<void> {
		if (!this.isEnabled()) return;

		try {
			const userKey = this.userFailureKey(userId);
			const ipKey = this.ipFailureKey(normalizeIp(ip) ?? ip);
			await this.redisClient.multi()
				.incr(userKey)
				.expire(userKey, FAILURE_WINDOW_SEC)
				.sadd(ipKey, userId)
				.expire(ipKey, FAILURE_WINDOW_SEC)
				.exec();
		} catch (err) {
			this.logger.warn(`failed to record login failure: ${err}`);
		}
	}

	private hmac(value: string): string {
		return createHmac('sha256', `${this.meta.id}:login-risk`).update(value).digest('hex');
	}

	private userFailureKey(userId: MiUser['id']): string {
		return `loginRisk:fail:user:${userId}`;
	}

	private ipFailureKey(ip: string): string {
		return `loginRisk:fail:ip:${getIpHash(ip)}`;
	}

	/** 同じ (userId, kind, value) が同時に来ても壊れないよう ON CONFLICT で数を足す */
	private async upsertContexts(userId: MiUser['id'], entries: { kind: ContextKind; value: string }[]): Promise<void> {
		if (entries.length === 0) return;
		const now = new Date();

		const params: unknown[] = [];
		const rows = entries.map(e => {
			params.push(this.idService.gen(), userId, e.kind, e.value, now);
			const i = params.length;
			return `($${i - 4}, $${i - 3}, $${i - 2}, $${i - 1}, $${i}, $${i}, 1)`;
		});

		// TypeORM の orUpdate では hits = hits + 1 を表せないので SQL で書く
		await this.userLoginContextsRepository.query(
			`INSERT INTO "user_login_context" ("id", "userId", "kind", "value", "firstSeenAt", "lastSeenAt", "hits") VALUES ${rows.join(', ')}
			ON CONFLICT ("userId", "kind", "value") DO UPDATE SET "lastSeenAt" = EXCLUDED."lastSeenAt", "hits" = "user_login_context"."hits" + 1`,
			params,
		);
	}

	/** 国・ASN・プレフィックスの行が無いユーザーは、成功した signin の直近の記録から作る */
	private async backfillIfEmpty(userId: MiUser['id']): Promise<void> {
		const hasLocation = await this.userLoginContextsRepository.exists({
			where: { userId, kind: In(['country', 'asn', 'prefix']) },
		});
		if (hasLocation) return;

		const signins = await this.signinsRepository.find({
			select: { id: true, ip: true },
			where: { userId, success: true },
			order: { id: 'DESC' },
			take: BACKFILL_LIMIT,
		});

		const contexts = new Map<string, { kind: ContextKind; value: string; firstSeenAt: Date; lastSeenAt: Date; hits: number }>();
		for (const signin of signins) {
			const ip = normalizeIp(signin.ip);
			if (ip == null || isPrivateOrLoopbackIp(ip)) continue;

			const at = this.signinDate(signin.id);
			const intel = this.ipIntelligenceService.lookup(ip, {});
			const prefix = getIpPrefix(ip);
			const found: { kind: ContextKind; value: string | null }[] = [
				{ kind: 'country', value: intel.country },
				{ kind: 'asn', value: intel.asn != null ? String(intel.asn) : null },
				{ kind: 'prefix', value: prefix != null ? this.hmac(prefix) : null },
			];
			for (const { kind, value } of found) {
				if (value == null) continue;
				const key = `${kind}:${value}`;
				const existing = contexts.get(key);
				if (existing) {
					existing.hits++;
					if (at < existing.firstSeenAt) existing.firstSeenAt = at;
					if (at > existing.lastSeenAt) existing.lastSeenAt = at;
				} else {
					contexts.set(key, { kind, value, firstSeenAt: at, lastSeenAt: at, hits: 1 });
				}
			}
		}
		if (contexts.size === 0) return;

		// 同時のログインで先に作られていれば、そちらを残す
		await this.userLoginContextsRepository.createQueryBuilder()
			.insert()
			.into(MiUserLoginContext)
			.values([...contexts.values()].map(c => ({ id: this.idService.gen(), userId, ...c })))
			.orIgnore()
			.execute();
	}

	private signinDate(id: string): Date {
		try {
			return this.idService.parse(id).date;
		} catch {
			return new Date();
		}
	}

	/** 端末が1件も無ければ null(newDevice を付けない) */
	private async getDeviceKnown(userId: MiUser['id'], deviceTokenHash: string | null): Promise<boolean | null> {
		const hasDevice = await this.userLoginContextsRepository.exists({ where: { userId, kind: 'device' } });
		if (!hasDevice) return null;
		if (deviceTokenHash == null) return false;
		return await this.isKnown(userId, 'device', deviceTokenHash) ?? false;
	}

	private async isKnown(userId: MiUser['id'], kind: ContextKind, value: string | null): Promise<boolean | null> {
		if (value == null) return null;
		return await this.userLoginContextsRepository.exists({ where: { userId, kind, value } });
	}

	/** 学習済みのログイン回数。country 行の hits の合計で数える */
	private async countLearnedLogins(userId: MiUser['id']): Promise<number> {
		const sum = await this.userLoginContextsRepository.sum('hits', { userId, kind: 'country' });
		return sum ?? 0;
	}

	private async hasRecentOtherCountry(userId: MiUser['id'], country: string | null): Promise<boolean> {
		if (country == null) return false;
		return await this.signinsRepository.createQueryBuilder('signin')
			.where('signin.userId = :userId', { userId })
			.andWhere('signin.success = TRUE')
			.andWhere('signin.id > :sinceId', { sinceId: this.idService.gen(Date.now() - RECENT_OTHER_COUNTRY_MS) })
			.andWhere('signin.country IS NOT NULL')
			.andWhere('signin.country != :country', { country })
			.getExists();
	}

	private async getDaysSinceLastSuccess(userId: MiUser['id']): Promise<number | null> {
		const last = await this.signinsRepository.findOne({
			select: { id: true },
			where: { userId, success: true },
			order: { id: 'DESC' },
		});
		if (last == null) return null;
		return Math.floor((Date.now() - this.signinDate(last.id).getTime()) / DAY_MS);
	}
}
