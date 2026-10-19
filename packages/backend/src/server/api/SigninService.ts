/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Misskey from 'misskey-js';
import { DI } from '@/di-symbols.js';
import type { SigninsRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { MiSignin } from '@/models/Signin.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { SigninEntityService } from '@/core/entities/SigninEntityService.js';
import { bindThis } from '@/decorators.js';
import { EmailService } from '@/core/EmailService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { LoginRiskService } from '@/core/LoginRiskService.js';
import type { LoginRiskEvaluation } from '@/core/LoginRiskService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import { escapeHtml } from '@/misc/escape-html.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

/** signin の記録とメール本文に残さないヘッダー */
const SENSITIVE_HEADERS = new Set(['cookie', 'authorization']);

export function sanitizeSigninHeaders(headers: Record<string, any>): Record<string, any> {
	return Object.fromEntries(Object.entries(headers).filter(([key]) => !SENSITIVE_HEADERS.has(key.toLowerCase())));
}

export function formatSigninHeaders(headers: Record<string, any>): string {
	return Object.entries(sanitizeSigninHeaders(headers))
		.map(([key, val]) => `${key}: ${val}`)
		.join('\n');
}

/** メール本文に載せる国と ASN */
export function describeLoginLocation(ev: Pick<LoginRiskEvaluation, 'country' | 'asn' | 'asnOrg'>): string[] {
	const asn = ev.asn != null ? `AS${ev.asn}${ev.asnOrg != null ? ` ${ev.asnOrg}` : ''}` : '-';
	return [`country: ${ev.country ?? '-'}`, `ASN: ${asn}`];
}

export type SigninOptions = {
	/** 判定結果。無ければ判定していないログインとして扱う */
	ev?: LoginRiskEvaluation;
	/** 判定できていれば学習する。正しい形式の端末トークンが送られていなければ新しく発行する */
	learn?: boolean;
	/** 判定せずに学習だけする(サインアップ直後) */
	learnOnly?: boolean;
	challenge?: 'passed';
};

@Injectable()
export class SigninService {
	private logger: Logger;

	constructor(
		@Inject(DI.signinsRepository)
		private signinsRepository: SigninsRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private signinEntityService: SigninEntityService,
		private emailService: EmailService,
		private notificationService: NotificationService,
		private idService: IdService,
		private globalEventService: GlobalEventService,
		private loginRiskService: LoginRiskService,
		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('signin');
	}

	/** signin テーブルに1件記録する。危険なヘッダーは除いて保存する */
	@bindThis
	public async recordSignin(request: FastifyRequest, userId: MiUser['id'], p: { success: boolean; ev?: LoginRiskEvaluation | null; challenge?: MiSignin['challenge'] }): Promise<MiSignin> {
		const ev = p.ev?.skipped === false ? p.ev : null;
		return await this.signinsRepository.insertOne({
			id: this.idService.gen(),
			userId,
			ip: request.ip,
			headers: sanitizeSigninHeaders(request.headers as any),
			success: p.success,
			country: ev?.country ?? null,
			asn: ev?.asn ?? null,
			riskScore: ev?.score ?? null,
			riskReasons: p.ev?.reasons ?? [],
			challenge: p.challenge ?? null,
		});
	}

	@bindThis
	public async signin(request: FastifyRequest, reply: FastifyReply, user: MiLocalUser, opts: SigninOptions = {}): Promise<Misskey.entities.SigninFlowResponse> {
		const ev = opts.learnOnly
			? this.loginRiskService.buildLearnOnlyEvaluation(request.ip, request.headers) ?? undefined
			: opts.ev;

		let deviceToken: string | undefined;
		if (ev != null && ev.skipped === false && (opts.learn || opts.learnOnly) && this.loginRiskService.isEnabled()) {
			try {
				await this.loginRiskService.learn(user.id, ev);
				// 送られたトークンは learn で覚えたので、そのまま使い続けてもらう(同じブラウザの複数アカウントで共有するため)
				if (ev.deviceTokenHash == null) {
					deviceToken = await this.loginRiskService.issueDeviceToken(user.id);
				}
			} catch (err) {
				this.logger.error(`failed to learn login context or issue device token for ${user.id}`, { error: err });
			}
		}

		if (opts.challenge === 'passed' && user.suspiciousLoginDetectedAt != null) {
			// メールの確認コードで本人確認できたのでフラグを外す。失敗してもログインは止めない
			try {
				await this.usersRepository.update(user.id, { suspiciousLoginDetectedAt: null });
				this.globalEventService.publishInternalEvent('localUserUpdated', { id: user.id });
			} catch (err) {
				this.logger.error(`failed to clear suspiciousLoginDetectedAt of ${user.id}`, { error: err });
			}
		}

		setImmediate(() => {
			this.afterSignin(request, user, ev, opts).catch(err => {
				this.logger.error(`failed to record signin of ${user.id}`, { error: err });
			});
		});

		reply.code(200);
		return {
			finished: true,
			id: user.id,
			i: user.token!,
			...(deviceToken != null ? { deviceToken } : {}),
		} satisfies Misskey.entities.SigninFlowResponse;
	}

	/** 記録・通知・メール。レスポンスを返した後に行う */
	private async afterSignin(request: FastifyRequest, user: MiLocalUser, ev: LoginRiskEvaluation | undefined, opts: SigninOptions): Promise<void> {
		this.notificationService.createNotification(user.id, 'login', {
			userIp: request.ip,
		});

		const record = await this.recordSignin(request, user.id, { success: true, ev: opts.learnOnly ? null : ev, challenge: opts.challenge });

		this.globalEventService.publishMainStream(user.id, 'signin', await this.signinEntityService.pack(record));

		// 判定できたときは notify 以上だけ送る。無効・スキップ・判定しないとき(サインアップ直後)は今までどおり毎回送る
		const evaluated = !opts.learnOnly && ev != null && ev.skipped === false;
		if (evaluated && ev.level === 'allow') return;

		const profile = await this.userProfilesRepository.findOneByOrFail({ userId: user.id });
		if (profile.email && profile.emailVerified) {
			const name = user.name ?? `@${user.username}`;
			const headers = formatSigninHeaders(request.headers as any);
			const location = evaluated ? describeLoginLocation(ev) : [];
			const message = 'There is a new login. If you do not recognize this login, update the security status of your account, including changing your password. / 新しいログインがありました。このログインに心当たりがない場合は、パスワードを変更するなど、アカウントのセキュリティ状態を更新してください。';

			this.emailService.sendEmail(profile.email, 'New login / ログインがありました',
				`userid: ${escapeHtml(name)} <br>` +
				`ip: ${escapeHtml(request.ip)} <br>` +
				location.map(l => `${escapeHtml(l)} <br>`).join('') +
				`header: <pre>${escapeHtml(headers)}</pre><br>` +
				message,
				`userid: ${name} \n` +
				`ip: ${request.ip} \n` +
				location.map(l => `${l} \n`).join('') +
				'header:\n' + headers + '\n' +
				message);
		}
	}
}
