/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { ModuleRef } from '@nestjs/core';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { Config } from '@/config.js';
import { IsNull } from 'typeorm';
import type { InstancesRepository, AccessTokensRepository, UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';
import endpoints from './endpoints.js';
import { ApiCallService } from './ApiCallService.js';
import { SignupApiService } from './SignupApiService.js';
import { SigninApiService } from './SigninApiService.js';
import { SigninWithPasskeyApiService } from './SigninWithPasskeyApiService.js';
import { SsoService, SsoError, resolveSsoAdditionalAuthRequirement } from './SsoService.js';
import { WebAuthnService } from '@/core/WebAuthnService.js';
import { RateLimiterService } from './RateLimiterService.js';
import { getIpHash } from '@/misc/get-ip-hash.js';
import type { MiLocalUser } from '@/models/User.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import type { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from 'fastify';

@Injectable()
export class ApiServerService {
	private logger: Logger;

	constructor(
		private moduleRef: ModuleRef,

		@Inject(DI.config)
		private config: Config,

		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		@Inject(DI.accessTokensRepository)
		private accessTokensRepository: AccessTokensRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private userEntityService: UserEntityService,
		private apiCallService: ApiCallService,
		private signupApiService: SignupApiService,
		private signinApiService: SigninApiService,
		private signinWithPasskeyApiService: SigninWithPasskeyApiService,
		private ssoService: SsoService,
		private webAuthnService: WebAuthnService,
		private rateLimiterService: RateLimiterService,
		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('sso');
		//this.createServer = this.createServer.bind(this);
	}

	private ssoBindingCookieName = 'sso_binding';

	private setSsoBindingCookie(reply: FastifyReply, value: string, maxAge: number): void {
		const secure = this.config.url.startsWith('https://') ? '; Secure' : '';
		reply.header('set-cookie', `${this.ssoBindingCookieName}=${value}; Path=/api/sso; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
	}

	private clearSsoBindingCookie(reply: FastifyReply): void {
		this.setSsoBindingCookie(reply, '', 0);
	}

	private getSsoBindingCookie(request: FastifyRequest): string | undefined {
		const header = request.headers.cookie;
		if (header == null) return undefined;
		for (const part of header.split(';')) {
			const [name, ...rest] = part.trim().split('=');
			if (name === this.ssoBindingCookieName) return rest.join('=');
		}
		return undefined;
	}

	/** SSO の生ルートは endpoint-meta のレート制限を通らないため、明示的に制限する */
	private async limitSsoRequest(request: FastifyRequest, reply: FastifyReply, key: string, opts?: { skipMinInterval?: boolean }): Promise<boolean> {
		if (!this.config.enableIpRateLimit) return true;
		// 追加認証の送信 (TOTP/パスキー) は直前のチャレンジ取得に即座に続くため minInterval を適用しない。
		// 長期上限 (30回/10分/IP) は引き続き全リクエストに適用され、ブルートフォース耐性は維持される。
		const rateLimit = await this.rateLimiterService.limit(
			opts?.skipMinInterval ? { key, duration: 10 * 60 * 1000, max: 30 } : { key, duration: 10 * 60 * 1000, max: 30, minInterval: 1000 },
			getIpHash(request.ip),
		);
		if (rateLimit != null) {
			reply.code(429).send({ error: { message: 'Rate limit exceeded. Try again later.', code: 'RATE_LIMIT_EXCEEDED', id: '7d0e1f2a-3b4c-4d5e-8f9a-0b1c2d3e4f5a' } });
			return false;
		}
		return true;
	}

	@bindThis
	public createServer(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
		fastify.register(cors, {
			origin: '*',
		});

		fastify.register(multipart, {
			limits: {
				fileSize: this.config.maxFileSize,
				files: 1,
			},
		});

		// Prevent cache
		fastify.addHook('onRequest', (request, reply, done) => {
			reply.header('Cache-Control', 'private, max-age=0, must-revalidate');
			done();
		});

		for (const endpoint of endpoints) {
			const ep = {
				name: endpoint.name,
				meta: endpoint.meta,
				params: endpoint.params,
				exec: this.moduleRef.get('ep:' + endpoint.name, { strict: false }).exec,
			};

			if (endpoint.meta.requireFile) {
				fastify.all<{
					Params: { endpoint: string; },
					Body: Record<string, unknown>,
					Querystring: Record<string, unknown>,
				}>('/' + endpoint.name, async (request, reply) => {
					if (request.method === 'GET' && !endpoint.meta.allowGet) {
						reply.code(405);
						reply.send();
						return;
					}

					// Await so that any error can automatically be translated to HTTP 500
					await this.apiCallService.handleMultipartRequest(ep, request, reply);
					return reply;
				});
			} else {
				fastify.all<{
					Params: { endpoint: string; },
					Body: Record<string, unknown>,
					Querystring: Record<string, unknown>,
				}>('/' + endpoint.name, { bodyLimit: 1024 * 1024 }, async (request, reply) => {
					if (request.method === 'GET' && !endpoint.meta.allowGet) {
						reply.code(405);
						reply.send();
						return;
					}

					// Await so that any error can automatically be translated to HTTP 500
					await this.apiCallService.handleRequest(ep, request, reply);
					return reply;
				});
			}
		}

		fastify.post<{
			Body: {
				username: string;
				password: string;
				host?: string;
				invitationCode?: string;
				emailAddress?: string;
				reason?: string;
				'hcaptcha-response'?: string;
				'g-recaptcha-response'?: string;
				'turnstile-response'?: string;
				'm-captcha-response'?: string;
				'testcaptcha-response'?: string;
			}
		}>('/signup', (request, reply) => this.signupApiService.signup(request, reply));

		fastify.post<{
			Body: {
				username: string;
				password?: string;
				token?: string;
				credential?: AuthenticationResponseJSON;
				'hcaptcha-response'?: string;
				'g-recaptcha-response'?: string;
				'turnstile-response'?: string;
				'm-captcha-response'?: string;
				'testcaptcha-response'?: string;
			};
		}>('/signin-flow', (request, reply) => this.signinApiService.signin(request, reply));

		fastify.post<{
			Body: {
				credential?: AuthenticationResponseJSON;
				context?: string;
			};
		}>('/signin-with-passkey', (request, reply) => this.signinWithPasskeyApiService.signin(request, reply));

		// SSO (OIDC / OAuth2) ログイン
		fastify.get<{
			Querystring: { provider?: string; };
		}>('/sso/initiate', async (request, reply) => {
			const providerKey = request.query.provider;
			if (!providerKey) {
				reply.code(400).send({ error: { message: 'Missing provider parameter', code: 'MISSING_PROVIDER', id: '3f6a1c2e-7b8d-4e5f-9a0b-1c2d3e4f5a6b' } });
				return;
			}
			if (!await this.limitSsoRequest(request, reply, 'sso-initiate')) return;
			try {
				const { authorizationUrl, binding } = await this.ssoService.initiate('login', providerKey);
				if (binding != null) {
					this.setSsoBindingCookie(reply, binding, 600);
				}
				reply.redirect(authorizationUrl);
			} catch (err) {
				if (err instanceof SsoError) {
					reply.code(400).send({ error: { message: err.message, code: err.code, id: '4a7b2d3f-8c9e-4f6a-0b1c-2d3e4f5a6b7c' } });
					return;
				}
				throw err;
			}
		});

		fastify.get<{
			Params: { provider: string; };
			Querystring: { code?: string; state?: string; error?: string; iss?: string; };
		}>('/sso/callback/:provider', async (request, reply) => {
			const providerKey = request.params.provider;
			const { code, state, iss } = request.query;
			const webCallbackUrl = `${this.config.url}/sso/callback`;

			// ログイン成功時だけ、ログインコードの交換まで束縛Cookieを残す (交換時に同じブラウザかを確認する)。
			// それ以外 (失敗・連携) は必ず削除する
			const binding = this.getSsoBindingCookie(request);

			if (request.query.error) {
				this.clearSsoBindingCookie(reply);
				reply.redirect(`${webCallbackUrl}?sso_error=PROVIDER_ERROR`);
				return;
			}
			if (!code || !state) {
				this.clearSsoBindingCookie(reply);
				reply.code(400).send({ error: { message: 'Missing code or state parameter', code: 'INVALID_REQUEST', id: '5b8c3e4a-9d0f-4a7b-1c2d-3e4f5a6b7c8d' } });
				return;
			}
			if (!await this.limitSsoRequest(request, reply, 'sso-callback')) {
				this.clearSsoBindingCookie(reply);
				return;
			}
			try {
				const result = await this.ssoService.handleCallback(providerKey, code, state, binding, iss);
				if (result.type === 'login') {
					// 束縛Cookieはログインコードの交換まで残す。有効期間は認可開始時から数えて切れないよう、ここで 600 秒に延ばし直す
					if (binding != null) this.setSsoBindingCookie(reply, binding, 600);
					reply.redirect(`${webCallbackUrl}?code=${encodeURIComponent(result.loginCode)}`);
				} else {
					this.clearSsoBindingCookie(reply);
					reply.redirect(`${this.config.url}/settings/security?sso_linked=${encodeURIComponent(providerKey)}`);
				}
			} catch (err) {
				this.clearSsoBindingCookie(reply);
				if (err instanceof SsoError) {
					this.logger.warn(`SSO callback failed (provider=${providerKey}): ${err.message}`);
					reply.redirect(`${webCallbackUrl}?sso_error=${encodeURIComponent(err.code)}`);
					return;
				}
				this.logger.error(`SSO callback error (provider=${providerKey}): ${err}`);
				reply.redirect(`${webCallbackUrl}?sso_error=INTERNAL`);
			}
		});

		fastify.post<{
			Body: { code?: string; token?: string; credential?: AuthenticationResponseJSON; deviceToken?: string; challengeId?: string; emailCode?: string; };
		}>('/sso/exchange-code', async (request, reply) => {
			// パスキー確認はチャレンジ取得の1秒以内に完了しうるため、追加認証の送信には minInterval を課さない
			const hasAdditionalAuth = (typeof request.body?.token === 'string' && request.body.token.length > 0) || request.body?.credential != null;
			if (!await this.limitSsoRequest(request, reply, 'sso-exchange-code', { skipMinInterval: hasAdditionalAuth })) return;

			const code = request.body?.code;
			if (typeof code !== 'string' || code.length === 0) {
				reply.code(400).send({ error: { message: 'Missing code', code: 'INVALID_REQUEST', id: '6c9d4f5b-0e1a-4b8c-2d3e-4f5a6b7c8d9e' } });
				return;
			}

			// 追加認証が必要な場合があるため、この時点ではコードを消費しない
			const pending = await this.ssoService.peekLoginCode(code);
			if (!pending) {
				reply.code(400).send({ error: { message: 'Invalid or expired code', code: 'INVALID_CODE', id: '7d0e5a6c-1f2b-4c9d-3e4f-5a6b7c8d9e0f' } });
				return;
			}

			// 認可を開始したブラウザ以外からの交換は受け付けない (作為的なリンクで別人をログインさせる攻撃の防止)
			if (!this.ssoService.isLoginCodeBoundTo(pending, this.getSsoBindingCookie(request))) {
				reply.code(400).send({ error: { message: 'Invalid or expired code', code: 'INVALID_CODE', id: '7d0e5a6c-1f2b-4c9d-3e4f-5a6b7c8d9e0f' } });
				return;
			}

			// メール確認コードや追加認証の待機中に束縛Cookieだけが先に切れないよう、受け付けるたびに延ばし直す
			// (ログインが確定したら末尾で削除する)
			const bindingValue = this.getSsoBindingCookie(request)!;
			this.setSsoBindingCookie(reply, bindingValue, 600);

			const user = await this.usersRepository.findOneBy({ id: pending.userId, host: IsNull() }) as MiLocalUser | null;
			if (!user || user.isSuspended) {
				reply.code(403).send({ error: { message: 'User not found or suspended', code: 'USER_NOT_FOUND', id: '8e1f6b7d-2a3c-4d0e-4f5a-6b7c8d9e0f1a' } });
				return;
			}
			// パスワードログインと同じく、承認待ちのアカウントは SSO でもログインさせない
			if (await this.ssoService.isApprovalPending(user)) {
				reply.code(403).send({ error: { message: 'Your account is not approved yet.', code: 'YOUR_ACCOUNT_NOT_APPROVED', id: '2fe70810-0ed2-47db-a70b-dc3ecbf5f069' } });
				return;
			}

			// 発行後の状態変化を必ず再検証する: 連携が解除されていないか、プロバイダーが無効化されていないか。
			// 追加認証の要否も発行時の値ではなく、最新のプロフィール・プロバイダー設定から決定する
			const revalidation = await this.ssoService.revalidateLoginCode(pending);
			if (revalidation == null) {
				reply.code(400).send({ error: { message: 'Invalid or expired code', code: 'INVALID_CODE', id: '7d0e5a6c-1f2b-4c9d-3e4f-5a6b7c8d9e0f' } });
				return;
			}

			// ローカルのサインインポリシーと揃える: 追加認証が必須なのはローカル 2FA (TOTP) が
			// 有効なアカウントのみ。セキュリティキーが登録されていれば TOTP の代替として
			// パスキー確認も受け付ける (IdP 側 MFA を信頼しないプロバイダーの場合)
			let passedSecondFactor = false;
			const additionalAuth = resolveSsoAdditionalAuthRequirement(revalidation.profile, revalidation.securityKeysAvailable, revalidation.provider.trustUpstreamMfa === true);
			if (additionalAuth !== 'none') {
				const token = request.body?.token;
				const credential = request.body?.credential;
				if (typeof token === 'string' && token.length > 0) {
					if (!await this.ssoService.verifyAdditionalAuth(user.id, token)) {
						await this.ssoService.recordAdditionalAuthFailure(code);
						await this.signinApiService.recordSecondFactorFailure(request, user);
						reply.code(403).send({ error: { message: 'Two-factor authentication failed', code: 'TWO_FACTOR_AUTH_FAILED', id: '9f2a7c8e-3b4d-5e1f-6a7b-8c9d0e1f2a3b' } });
						return;
					}
					passedSecondFactor = true;
				} else if (credential != null && additionalAuth === 'passkey') {
					// verifyAuthentication はチャレンジ失効・未登録キー等で例外を投げるため、
					// 例外も検証失敗として失敗回数にカウントする
					let verified = false;
					try {
						verified = await this.webAuthnService.verifyAuthentication(user.id, credential);
					} catch {
						verified = false;
					}
					if (!verified) {
						await this.ssoService.recordAdditionalAuthFailure(code);
						await this.signinApiService.recordSecondFactorFailure(request, user);
						reply.code(403).send({ error: { message: 'Two-factor authentication failed', code: 'TWO_FACTOR_AUTH_FAILED', id: '6b3a9d1e-4f5c-4a2b-8c7d-9e0f1a2b3c4d' } });
						return;
					}
					passedSecondFactor = true;
				} else if (additionalAuth === 'passkey') {
					return { finished: false, next: 'passkey', authRequest: await this.webAuthnService.initiateAuthentication(user.id) };
				} else {
					return { finished: false, next: 'totp' };
				}
			}

			// ここから先は通常のパスワード/パスキーログインと同じリスク判定。
			// IdP 側 MFA を信頼する設定はローカル 2FA を省くだけで、リスクに応じた追加認証(メール確認コード)は省かない。
			// 確認コードを送る場合に備え、ログインコードはログインを確定する直前まで消費しない
			const consume = async () => await this.ssoService.consumeLoginCode(code);
			if (request.body?.challengeId != null && request.body?.emailCode != null) {
				// メール確認コードの照合は追加認証が不要な(または通過済みの)場合だけ到達する。
				// 通過済みの場合は確認コードを要求していないので、そのまま通常のリスク判定に進む
				if (!passedSecondFactor) {
					return await this.signinApiService.finishWithEmailCode(request, reply, user, {
						challengeId: request.body.challengeId,
						emailCode: request.body.emailCode,
						beforeSignin: consume,
						onCountedFailure: async () => await this.ssoService.recordAdditionalAuthFailure(code),
					});
				}
			}
			const result = await this.signinApiService.finishWithRisk(request, reply, user, { email: revalidation.profile?.email ?? null, emailVerified: revalidation.profile?.emailVerified === true }, {
				passedSecondFactor,
				deviceToken: request.body?.deviceToken,
				beforeSignin: consume,
			});
			// メールの確認コードを待つ間にログインコードが先に切れて、SSO をやり直すことにならないようにする
			if ('finished' in result && result.finished === false && result.next === 'emailCode') {
				await this.ssoService.extendLoginCodeForEmailChallenge(code).catch(err => {
					this.logger.warn(`failed to extend SSO login code for email challenge: ${err}`);
				});
			}
			// ログインが確定したら束縛Cookieを削除する
			if ('finished' in result && result.finished === true) {
				this.clearSsoBindingCookie(reply);
			}
			return result;
		});

		fastify.post<{ Body: { code: string; } }>('/signup-pending', (request, reply) => this.signupApiService.signupPending(request, reply));

		fastify.get('/v1/instance/peers', async (request, reply) => {
			const instances = await this.instancesRepository.find({
				select: { host: true },
				where: {
					suspensionState: 'none',
				},
			});

			return instances.map(instance => instance.host);
		});

		fastify.post<{ Params: { session: string; } }>('/miauth/:session/check', async (request, reply) => {
			const token = await this.accessTokensRepository.findOneBy({
				session: request.params.session,
			});

			if (token && token.session != null && !token.fetched) {
				this.accessTokensRepository.update(token.id, {
					fetched: true,
				});

				return {
					ok: true,
					token: token.token,
					user: await this.userEntityService.pack(token.userId, null, { schema: 'UserDetailedNotMe' }),
				};
			} else {
				return {
					ok: false,
				};
			}
		});

		fastify.all('/clear-browser-cache', (request, reply) => {
			if (['GET', 'POST'].includes(request.method)) {
				reply.header('Clear-Site-Data', '"cache", "prefetchCache", "prerenderCache", "executionContexts"');
				reply.code(204);
				reply.send();
			} else {
				reply.code(405);
				reply.send();
			}
		});

		// Make sure any unknown path under /api returns HTTP 404 Not Found,
		// because otherwise ClientServerService will return the base client HTML
		// page with HTTP 200.
		fastify.get('/*', (request, reply) => {
			reply.code(404);
			// Mock ApiCallService.send's error handling
			reply.send({
				error: {
					message: 'Unknown API endpoint.',
					code: 'UNKNOWN_API_ENDPOINT',
					id: '2ca3b769-540a-4f08-9dd5-b5a825b6d0f1',
					kind: 'client',
				},
			});
		});

		done();
	}
}
