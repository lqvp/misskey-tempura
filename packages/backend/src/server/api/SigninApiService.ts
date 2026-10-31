/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { IsNull } from 'typeorm';
import * as Misskey from 'misskey-js';
import { DI } from '@/di-symbols.js';
import type {
	MiMeta,
	SigninsRepository,
	UserProfilesRepository,
	UserSecurityKeysRepository,
	UsersRepository,
} from '@/models/_.js';
import type Logger from '@/logger.js';
import type { Config } from '@/config.js';
import { getIpHash } from '@/misc/get-ip-hash.js';
import type { MiLocalUser } from '@/models/User.js';
import { IdService } from '@/core/IdService.js';
import { bindThis } from '@/decorators.js';
import { WebAuthnService } from '@/core/WebAuthnService.js';
import { UserAuthService } from '@/core/UserAuthService.js';
import { CaptchaService } from '@/core/CaptchaService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { FastifyReplyError } from '@/misc/fastify-reply-error.js';
import { escapeHtml } from '@/misc/escape-html.js';
import { MetaService } from '@/core/MetaService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { EmailService } from '@/core/EmailService.js';
import { LoginRiskService } from '@/core/LoginRiskService.js';
import type { LoginRiskEvaluation } from '@/core/LoginRiskService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { RateLimiterService } from './RateLimiterService.js';
import { SigninService, describeLoginLocation, formatSigninHeaders, sanitizeSigninHeaders } from './SigninService.js';
import { LoginChallengeService } from './LoginChallengeService.js';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const LOGIN_CHALLENGE_INVALID = 'b3fddf43-a0d3-41f3-9ca9-8de701a6f418';
export const LOGIN_CHALLENGE_EXPIRED = '9939b972-0830-4a48-a1b4-f6fe9d259a89';
export const LOGIN_CHALLENGE_TOO_MANY_ATTEMPTS = '7606fbea-f065-4c3f-9040-4fb2c884e1b6';
export const LOGIN_CHALLENGE_RATE_LIMITED = '20345fd1-1f7c-4d48-b4e8-cd169c500f2c';
export const LOGIN_CHALLENGE_SEND_FAILED = '23ce18ed-2f0a-4d17-83df-88b4e28275f5';

@Injectable()
export class SigninApiService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.userSecurityKeysRepository)
		private userSecurityKeysRepository: UserSecurityKeysRepository,

		@Inject(DI.signinsRepository)
		private signinsRepository: SigninsRepository,

		private loggerService: LoggerService,
		private idService: IdService,
		private rateLimiterService: RateLimiterService,
		private signinService: SigninService,
		private emailService: EmailService,
		private userAuthService: UserAuthService,
		private webAuthnService: WebAuthnService,
		private captchaService: CaptchaService,
		private metaService: MetaService,
		private notificationService: NotificationService,
		private loginRiskService: LoginRiskService,
		private loginChallengeService: LoginChallengeService,
		private globalEventService: GlobalEventService,
	) {
		this.logger = this.loggerService.getLogger('Signin');
	}

	@bindThis
	public async signin(
		request: FastifyRequest<{
			Body: {
				username: string;
				password?: string;
				token?: string;
				credential?: AuthenticationResponseJSON;
				deviceToken?: string;
				challengeId?: string;
				emailCode?: string;
				'hcaptcha-response'?: string;
				'g-recaptcha-response'?: string;
				'turnstile-response'?: string;
				'm-captcha-response'?: string;
				'testcaptcha-response'?: string;
			};
		}>,
		reply: FastifyReply,
	) {
		reply.header('Access-Control-Allow-Origin', this.config.url);
		reply.header('Access-Control-Allow-Credentials', 'true');

		const instance = await this.metaService.fetch(true);

		const body = request.body;
		const username = body['username'];
		const password = body['password'];
		const token = body['token'];

		function error(status: number, error: { id: string }) {
			reply.code(status);
			return { error };
		}

		// not more than 1 attempt per second and not more than 10 attempts per hour
		if (this.config.enableIpRateLimit) {
			if (process.env.NODE_ENV === 'production' && (request.ip === '::1' || request.ip === '127.0.0.1')) {
				this.logger.warn('Recieved signin request from localhost IP address for rate limiting in production environment. This is likely due to an improper trustProxy setting in the config file.');
			}
			const rateLimit = await this.rateLimiterService.limit({ key: 'signin', duration: 60 * 60 * 1000, max: 10, minInterval: 1000 }, getIpHash(request.ip));
			if (rateLimit != null) {
				reply.code(429);
				return {
					error: {
						message: 'Too many failed attempts to sign in. Try again later.',
						code: 'TOO_MANY_AUTHENTICATION_FAILURES',
						id: '22d05606-fbcf-421a-a2db-b32610dcfd1b',
					},
				};
			}
		}

		if (typeof username !== 'string') {
			reply.code(400);
			return;
		}

		if (token != null && typeof token !== 'string') {
			reply.code(400);
			return;
		}

		// Fetch user
		const user = await this.usersRepository.findOneBy({
			usernameLower: username.toLowerCase(),
			host: IsNull(),
		}) as MiLocalUser;

		if (user == null) {
			return error(404, {
				id: '6cc579cc-885d-43d8-95c2-b8c7fc963280',
			});
		}

		// Sub-accounts have no password or passkey of their own; they are entered from the main account only
		if (user.parentUserId != null) {
			return error(403, {
				id: '3f6f9a0e-6d44-4a8b-9c51-2b0d7e5a1c77',
			});
		}

		if (user.isSuspended) {
			return error(403, {
				id: 'e03a5f46-d309-4865-9b69-56282d94e1eb',
			});
		}

		const profile = await this.userProfilesRepository.findOneByOrFail({ userId: user.id });

		// 確認コードの入力(2回目のリクエスト)。パスワードと captcha は再要求しない
		if (body.challengeId != null && body.emailCode != null) {
			const result = await this.loginChallengeService.verify({ userId: user.id, challengeId: body.challengeId, code: body.emailCode, ip: request.ip });
			if (result.ok) {
				return await this.signinService.signin(request, reply, user, { ev: result.ev, learn: true, challenge: 'passed' });
			}

			// challenge が無い・他人のものなら、パスワードを知らなくても送れるので失敗として数えない。
			// 発行時と別のネットワーク(回線の切り替えなど)なら、ログインからやり直してもらう
			if (result.reason === 'noChallenge' || result.reason === 'otherUser' || result.reason === 'prefixMismatch') {
				return error(403, { id: LOGIN_CHALLENGE_EXPIRED });
			}

			await this.signinService.recordSignin(request, user.id, { success: false, challenge: 'failed' });
			await this.loginRiskService.recordFailure(user.id, request.ip);
			return error(403, {
				id: result.reason === 'tooManyAttempts' ? LOGIN_CHALLENGE_TOO_MANY_ATTEMPTS : LOGIN_CHALLENGE_INVALID,
			});
		}

		const securityKeysAvailable = await this.userSecurityKeysRepository.countBy({ userId: user.id }).then(result => result >= 1);

		if (password == null) {
			reply.code(200);
			if (profile.twoFactorEnabled) {
				return {
					finished: false,
					next: 'password',
				} satisfies Misskey.entities.SigninFlowResponse;
			} else {
				return {
					finished: false,
					next: 'captcha',
				} satisfies Misskey.entities.SigninFlowResponse;
			}
		}

		if (typeof password !== 'string') {
			reply.code(400);
			return;
		}

		if (user.approved === false && instance.approvalRequiredForSignup) {
			reply.code(403);
			return {
				error: {
					message: 'Your account is not approved yet.',
					code: 'YOUR_ACCOUNT_NOT_APPROVED',
					kind: 'permission',
					id: '2fe70810-0ed2-47db-a70b-dc3ecbf5f069',
				},
			};
		}

		// Compare password
		const same = await bcrypt.compare(password, profile.password!);

		const fail = async (status?: number, failure?: { id: string; }) => {
			// Append signin history
			await this.signinsRepository.insert({
				id: this.idService.gen(),
				userId: user.id,
				ip: request.ip,
				headers: sanitizeSigninHeaders(request.headers as any),
				success: false,
			});
			await this.loginRiskService.recordFailure(user.id, request.ip);

			// ログインに失敗したことを通知
			await this.notificationService.createNotification(user.id, 'loginFailed', {
				userIp: request.ip,
			});

			const profile = await this.userProfilesRepository.findOneByOrFail({ userId: user.id });
			if (profile.email && profile.emailVerified) {
				this.emailService.sendEmail(profile.email, 'Login failed / ログインに失敗しました',
					`${escapeHtml(user.name ?? '')}(@${escapeHtml(user.username)}) <br>` +
					`ip: ${escapeHtml(request.ip)} <br>` +
					`header: <pre>${escapeHtml(formatSigninHeaders(request.headers as any))}</pre><br>` +
					'There is a new login. If you do not recognize this login, update the security status of your account, including changing your password. / 新しいログインがありました。このログインに心当たりがない場合は、パスワードを変更するなど、アカウントのセキュリティ状態を更新してください。',
					`${user.name}(@${user.username}) \n` +
					`ip: ${request.ip} \n` +
					'header:\n' + formatSigninHeaders(request.headers as any) + '\n' +
					'There is a new login. If you do not recognize this login, update the security status of your account, including changing your password. / 新しいログインがありました。このログインに心当たりがない場合は、パスワードを変更するなど、アカウントのセキュリティ状態を更新してください。');
			}

			return error(status ?? 500, failure ?? { id: '4e30e80c-e338-45a0-8c8f-44455efa3b76' });
		};

		const finishSignin = async (passedSecondFactor: boolean) => {
			// 今回のログインを記録する前に判定する(記録すると前回のログインからの日数が変わる)
			const ev = await this.loginRiskService.evaluate({ user, ip: request.ip, headers: request.headers, deviceToken: body.deviceToken });

			// TOTP / パスキーを通過済みなら stepUp でも通知だけにする
			if (ev.level !== 'stepUp' || passedSecondFactor) {
				// 学習期間中で notify に抑えた stepUp 相当のログインは、本人と確かめられていないので学習しない
				const learn = passedSecondFactor || ev.uncappedLevel !== 'stepUp';
				return await this.signinService.signin(request, reply, user, { ev, learn });
			}

			if (this.meta.enableEmail && profile.email && profile.emailVerified) {
				const issued = await this.loginChallengeService.issue({ user, email: profile.email, ev, ip: request.ip });
				if ('challengeId' in issued) {
					await this.signinService.recordSignin(request, user.id, { success: false, ev, challenge: 'emailCode' });
					reply.code(200);
					return {
						finished: false,
						next: 'emailCode',
						challengeId: issued.challengeId,
					} satisfies Misskey.entities.SigninFlowResponse;
				}

				if (issued.error === 'rateLimited') {
					// 止めないと、パスワードを知る攻撃者が発行回数を使い切るだけで素通りできてしまう
					await this.signinService.recordSignin(request, user.id, { success: false, ev, challenge: 'emailCode' });
					await this.notifyBlockedLogin(request, user, profile.email, ev);
					return error(403, { id: LOGIN_CHALLENGE_RATE_LIMITED });
				}

				if (issued.error === 'sendFailed') {
					// 確認コードを届けられないので、追加認証を省かずにログインを止める。メールは届かないのでアプリ内通知だけ出す
					await this.signinService.recordSignin(request, user.id, { success: false, ev, challenge: 'emailCode' });
					await this.notificationService.createNotification(user.id, 'loginFailed', {
						userIp: request.ip,
					});
					return error(503, { id: LOGIN_CHALLENGE_SEND_FAILED });
				}

				// Redis に保存できなければ、通知したうえで通す(学習はしない)。
				// 本人を締め出さないことを優先した、意図した fail-open(仕様で決めた扱い)。
				// メールを送れないとき(sendFailed)は止めるのと扱いが違うが、Redis はサインインのレート制限などにも使っていて、
				// Redis が止まっている状態は外から作りにくいため
				// 注: 攻撃者が Redis を止められる環境では、この経路で追加認証を省けてしまう
				return await this.signinService.signin(request, reply, user, { ev, learn: false });
			}

			// 確認手段がないので、通知したうえで通す(学習はしない)
			if (this.meta.loginRiskFlagUnverifiedUsers) {
				// 失敗してもログインは止めない
				try {
					await this.usersRepository.update(user.id, { suspiciousLoginDetectedAt: new Date() });
					this.globalEventService.publishInternalEvent('localUserUpdated', { id: user.id });
				} catch (err) {
					this.logger.error(`failed to set suspiciousLoginDetectedAt of ${user.id}`, { error: err });
				}
			}
			return await this.signinService.signin(request, reply, user, { ev, learn: false });
		};

		if (!profile.twoFactorEnabled) {
			if (process.env.NODE_ENV !== 'test') {
				if (this.meta.enableHcaptcha && this.meta.hcaptchaSecretKey) {
					await this.captchaService.verifyHcaptcha(this.meta.hcaptchaSecretKey, body['hcaptcha-response']).catch(err => {
						throw new FastifyReplyError(400, err);
					});
				}

				if (this.meta.enableMcaptcha && this.meta.mcaptchaSecretKey && this.meta.mcaptchaSitekey && this.meta.mcaptchaInstanceUrl) {
					await this.captchaService.verifyMcaptcha(this.meta.mcaptchaSecretKey, this.meta.mcaptchaSitekey, this.meta.mcaptchaInstanceUrl, body['m-captcha-response']).catch(err => {
						throw new FastifyReplyError(400, err);
					});
				}

				if (this.meta.enableRecaptcha && this.meta.recaptchaSecretKey) {
					await this.captchaService.verifyRecaptcha(this.meta.recaptchaSecretKey, body['g-recaptcha-response']).catch(err => {
						throw new FastifyReplyError(400, err);
					});
				}

				if (this.meta.enableTurnstile && this.meta.turnstileSecretKey) {
					await this.captchaService.verifyTurnstile(this.meta.turnstileSecretKey, body['turnstile-response']).catch(err => {
						throw new FastifyReplyError(400, err);
					});
				}

				if (this.meta.enableTestcaptcha) {
					await this.captchaService.verifyTestcaptcha(body['testcaptcha-response']).catch(err => {
						throw new FastifyReplyError(400, err);
					});
				}
			}

			if (same) {
				if (!instance.approvalRequiredForSignup && !user.approved) this.usersRepository.update(user.id, { approved: true });
				return await finishSignin(false);
			} else {
				return await fail(403, {
					id: '932c904e-9460-45b7-9ce6-7ed33be7eb2c',
				});
			}
		}

		if (token) {
			if (!same) {
				return await fail(403, {
					id: '932c904e-9460-45b7-9ce6-7ed33be7eb2c',
				});
			}

			try {
				await this.userAuthService.twoFactorAuthenticate(profile, token);
			} catch (_) {
				return await fail(403, {
					id: 'cdf1235b-ac71-46d4-a3a6-84ccce48df6f',
				});
			}

			if (!instance.approvalRequiredForSignup && !user.approved) this.usersRepository.update(user.id, { approved: true });

			return await finishSignin(true);
		} else if (body.credential) {
			if (!same && !profile.usePasswordLessLogin) {
				return await fail(403, {
					id: '932c904e-9460-45b7-9ce6-7ed33be7eb2c',
				});
			}

			const authorized = await this.webAuthnService.verifyAuthentication(user.id, body.credential);

			if (authorized) {
				if (!instance.approvalRequiredForSignup && !user.approved) this.usersRepository.update(user.id, { approved: true });
				return await finishSignin(true);
			} else {
				return await fail(403, {
					id: '93b86c4b-72f9-40eb-9815-798928603d1e',
				});
			}
		} else if (securityKeysAvailable) {
			if (!same && !profile.usePasswordLessLogin) {
				return await fail(403, {
					id: '932c904e-9460-45b7-9ce6-7ed33be7eb2c',
				});
			}

			const authRequest = await this.webAuthnService.initiateAuthentication(user.id);

			reply.code(200);
			return {
				finished: false,
				next: 'passkey',
				authRequest,
			} satisfies Misskey.entities.SigninFlowResponse;
		} else {
			if (!same || !profile.twoFactorEnabled) {
				return await fail(403, {
					id: '932c904e-9460-45b7-9ce6-7ed33be7eb2c',
				});
			} else {
				reply.code(200);
				return {
					finished: false,
					next: 'totp',
				} satisfies Misskey.entities.SigninFlowResponse;
			}
		}
		// never get here
	}

	/** 確認コードを出せずにログインを止めたことを本人に知らせる */
	private async notifyBlockedLogin(request: FastifyRequest, user: MiLocalUser, email: string, ev: LoginRiskEvaluation): Promise<void> {
		await this.notificationService.createNotification(user.id, 'loginFailed', {
			userIp: request.ip,
		});

		const location = describeLoginLocation(ev);
		const message = 'A sign-in with your correct password was blocked because too many verification codes were requested. If you do not recognize this, change your password. / 確認コードの発行回数が上限に達したため、正しいパスワードでのログインを止めました。心当たりがなければパスワードを変更してください。';
		this.emailService.sendEmail(email, 'Login blocked / ログインを止めました',
			`${escapeHtml(user.name ?? '')}(@${escapeHtml(user.username)}) <br>` +
			`ip: ${escapeHtml(request.ip)} <br>` +
			location.map(l => `${escapeHtml(l)} <br>`).join('') +
			escapeHtml(message),
			`${user.name ?? ''}(@${user.username}) \n` +
			`ip: ${request.ip} \n` +
			location.map(l => `${l} \n`).join('') +
			message).catch(err => {
			this.logger.error(`failed to send login blocked email to ${user.id}`, { error: err });
		});
	}
}
