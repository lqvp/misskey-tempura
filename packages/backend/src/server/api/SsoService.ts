/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import {
	discovery,
	buildAuthorizationUrl,
	authorizationCodeGrant,
	randomPKCECodeVerifier,
	calculatePKCECodeChallenge,
	randomState,
	randomNonce,
	type Configuration,
} from 'openid-client';
import { DI } from '@/di-symbols.js';
import type { UserSsoLinkRepository, UserProfilesRepository, UserSecurityKeysRepository, MiUserProfile } from '@/models/_.js';
import { UserAuthService } from '@/core/UserAuthService.js';
import type { Config } from '@/config.js';
import type { SsoProviderConfig } from '@/models/Meta.js';
import { IdService } from '@/core/IdService.js';
import { bindThis } from '@/decorators.js';
import { MetaService } from '@/core/MetaService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import type Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';

const STATE_TTL_SEC = 600;
const LOGIN_CODE_TTL_SEC = 120;

/** 1つのログインコードに対する追加認証 (TOTP/パスキー) の失敗許容回数。超過したコードは失効する */
const MAX_ADDITIONAL_AUTH_ATTEMPTS = 5;

interface SsoState {
	provider: string;
	type: 'login' | 'link';
	/** link の場合の連携元ユーザー */
	userId?: string;
	codeVerifier?: string;
	nonce?: string;
	/** 認可を開始したブラウザに束縛するランダム値のSHA-256ハッシュ (login のみ) */
	bindingHash?: string;
	createdAt: number;
}

export class SsoError extends Error {
	constructor(
		public readonly code: string,
		message?: string,
	) {
		super(message ?? code);
		this.name = 'SsoError';
	}
}

/**
 * 交換時点の最新状態から、SSO での追加認証の要否を決定する (純粋関数)。
 * ローカルのサインインポリシー (SigninApiService) と揃える:
 * - 追加認証が必須なのはローカル 2FA (TOTP) が有効なアカウントのみ
 *   (セキュリティキーのみの登録ではローカルでもパスワード単独でサインインできる)
 * - セキュリティキーが登録されていれば、TOTP の代替としてパスキー確認を提示する
 * - プロバイダーが IdP 側 MFA を信頼する設定 (trustUpstreamMfa) の場合は省略する
 */
export function resolveSsoAdditionalAuthRequirement(
	profile: { twoFactorEnabled: boolean } | null,
	securityKeysAvailable: boolean,
	trustUpstreamMfa: boolean,
): 'none' | 'totp' | 'passkey' {
	if (trustUpstreamMfa) return 'none';
	if (profile?.twoFactorEnabled !== true) return 'none';
	return securityKeysAvailable ? 'passkey' : 'totp';
}

@Injectable()
export class SsoService {
	private logger: Logger;
	private oidcConfigCache = new Map<string, Promise<Configuration>>();

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.userSsoLinkRepository)
		private userSsoLinkRepository: UserSsoLinkRepository,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.userSecurityKeysRepository)
		private userSecurityKeysRepository: UserSecurityKeysRepository,

		private userAuthService: UserAuthService,

		private idService: IdService,
		private metaService: MetaService,
		private httpRequestService: HttpRequestService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('sso');
	}

	/** 有効なプロバイダー設定を取得。無効・未設定なら SsoError */
	@bindThis
	public async getProviderConfig(providerKey: string): Promise<SsoProviderConfig> {
		const meta = await this.metaService.fetch(true);
		const provider = meta.ssoProviders.find(p => p.key === providerKey);
		if (!provider || !provider.enabled) {
			throw new SsoError('PROVIDER_NOT_FOUND', `SSO provider "${providerKey}" is not configured or disabled`);
		}
		if (!provider.clientId || !provider.clientSecret) {
			throw new SsoError('PROVIDER_NOT_CONFIGURED', `SSO provider "${providerKey}" is missing clientId/clientSecret`);
		}
		if (provider.type === 'oidc' && !provider.issuerUrl) {
			throw new SsoError('PROVIDER_NOT_CONFIGURED', `SSO provider "${providerKey}" is missing issuerUrl`);
		}
		return provider;
	}

	@bindThis
	public getRedirectUri(providerKey: string): string {
		return `${this.config.url}/api/sso/callback/${encodeURIComponent(providerKey)}`;
	}

	/** OIDC (google 含む) の discovery 結果をキャッシュ付きで取得する */
	private async getOidcConfiguration(provider: SsoProviderConfig): Promise<Configuration> {
		const issuerUrl = provider.type === 'google' ? 'https://accounts.google.com' : provider.issuerUrl!;
		const secretHash = createHash('sha256').update(provider.clientSecret).digest('hex');
		const cacheKey = `${provider.key}:${issuerUrl}:${provider.clientId}:${secretHash}`;
		const cached = this.oidcConfigCache.get(cacheKey);
		if (cached) return cached;

		const promise = discovery(new URL(issuerUrl), provider.clientId, provider.clientSecret);
		this.oidcConfigCache.set(cacheKey, promise);
		try {
			return await promise;
		} catch (err) {
			// 失敗した Promise をキャッシュに残さない
			this.oidcConfigCache.delete(cacheKey);
			throw err;
		}
	}

	/**
	 * 認可URLを生成し、検証用の状態を Redis に保存する。
	 * ブラウザ束縛用のランダム値も返す (login: 呼び出し側がHttpOnly Cookieに設定、link: フロントエンドがCookieに設定)。
	 */
	@bindThis
	public async initiate(type: 'login' | 'link', providerKey: string, userId?: string): Promise<{ authorizationUrl: string; binding: string }> {
		const provider = await this.getProviderConfig(providerKey);
		const redirectUri = this.getRedirectUri(provider.key);
		const state = randomState();
		const ssoState: SsoState = { provider: provider.key, type, userId, createdAt: Date.now() };

		// CSRF対策: 開始したブラウザだけが持つ値のハッシュを state に紐付ける (login/link 共通)
		const binding = randomState();
		ssoState.bindingHash = createHash('sha256').update(binding).digest('hex');

		let authorizationUrl: string;

		if (provider.type === 'github') {
			const url = new URL('https://github.com/login/oauth/authorize');
			url.searchParams.set('client_id', provider.clientId);
			url.searchParams.set('redirect_uri', redirectUri);
			url.searchParams.set('scope', 'read:user');
			url.searchParams.set('state', state);
			authorizationUrl = url.toString();
		} else if (provider.type === 'discord') {
			const url = new URL('https://discord.com/oauth2/authorize');
			url.searchParams.set('client_id', provider.clientId);
			url.searchParams.set('redirect_uri', redirectUri);
			url.searchParams.set('response_type', 'code');
			url.searchParams.set('scope', 'identify');
			url.searchParams.set('state', state);
			authorizationUrl = url.toString();
		} else {
			// google / oidc
			const oidcConfig = await this.getOidcConfiguration(provider);
			const codeVerifier = randomPKCECodeVerifier();
			const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
			const nonce = randomNonce();
			ssoState.codeVerifier = codeVerifier;
			ssoState.nonce = nonce;

			authorizationUrl = buildAuthorizationUrl(oidcConfig, {
				scope: 'openid profile email',
				state,
				nonce,
				code_challenge: codeChallenge,
				code_challenge_method: 'S256',
				redirect_uri: redirectUri,
			}).toString();
		}

		await this.redisClient.set(`sso:state:${state}`, JSON.stringify(ssoState), 'EX', STATE_TTL_SEC);
		return { authorizationUrl, binding };
	}

	/**
	 * コールバックを処理する。
	 * login: ログインコード (使い捨て・短期) を返す。link: 連携したユーザーIDを返す。
	 */
	@bindThis
	public async handleCallback(
		providerKey: string,
		code: string,
		state: string,
		binding?: string,
		iss?: string,
	): Promise<{ type: 'login'; loginCode: string } | { type: 'link'; userId: string }> {
		const raw = await this.redisClient.getdel(`sso:state:${state}`);
		if (!raw) {
			throw new SsoError('INVALID_STATE', 'Invalid or expired state');
		}
		const stateData = JSON.parse(raw) as SsoState;
		if (stateData.provider !== providerKey) {
			throw new SsoError('INVALID_STATE', 'State does not match the provider');
		}
		if (stateData.bindingHash != null) {
			const actual = binding != null ? createHash('sha256').update(binding).digest('hex') : null;
			if (actual !== stateData.bindingHash) {
				throw new SsoError('INVALID_STATE', 'Browser binding does not match');
			}
		}

		const provider = await this.getProviderConfig(providerKey);
		const subject = await this.fetchSubject(provider, code, state, stateData, iss);

		if (stateData.type === 'link') {
			if (!stateData.userId) {
				throw new SsoError('INVALID_STATE', 'Missing userId for link flow');
			}

			const existingLink = await this.userSsoLinkRepository.findOneBy({
				provider: provider.key,
				providerUserId: subject,
			});
			if (existingLink) {
				throw new SsoError('ALREADY_LINKED_TO_OTHER', 'This external account is already linked to another user');
			}

			const existingUserLink = await this.userSsoLinkRepository.findOneBy({
				userId: stateData.userId,
				provider: provider.key,
			});
			if (existingUserLink) {
				throw new SsoError('ALREADY_LINKED', 'This user is already linked to this provider');
			}

			await this.userSsoLinkRepository.insert({
				id: this.idService.gen(),
				userId: stateData.userId,
				provider: provider.key,
				providerUserId: subject,
				createdAt: new Date(),
			});

			this.logger.info(`Linked SSO account (provider=${provider.key}) to user ${stateData.userId}`);
			return { type: 'link', userId: stateData.userId };
		}

		const link = await this.userSsoLinkRepository.findOneBy({
			provider: provider.key,
			providerUserId: subject,
		});
		if (!link) {
			throw new SsoError('NOT_LINKED', 'No account linked to this external identity');
		}

		// ワンタイムのログインコードを発行する (トークンは置かない)。
		// 追加認証の要否・連携の存続・プロバイダーの有効性は発行時ではなく交換時に必ず再検証するため、
		// ここでは連携を一意に特定する情報だけを保存する
		const loginCode = randomState();
		await this.redisClient.set(`sso:loginCode:${loginCode}`, JSON.stringify({ userId: link.userId, provider: provider.key, subject }), 'EX', LOGIN_CODE_TTL_SEC);

		return { type: 'login', loginCode };
	}

	/** ログインコードを消費せずに読み出す (追加認証の確認前に照合するため) */
	@bindThis
	public async peekLoginCode(loginCode: string): Promise<{ userId: string; provider: string; subject: string } | null> {
		const raw = await this.redisClient.get(`sso:loginCode:${loginCode}`);
		if (!raw) {
			return null;
		}
		try {
			const parsed = JSON.parse(raw) as { userId?: string; provider?: string; subject?: string };
			if (typeof parsed.userId !== 'string' || typeof parsed.provider !== 'string' || typeof parsed.subject !== 'string') {
				return null;
			}
			return { userId: parsed.userId, provider: parsed.provider, subject: parsed.subject };
		} catch {
			return null;
		}
	}

	/**
	 * 交換時の再検証: 発行後に連携が解除されていないか、プロバイダーが無効化・変更されていないか、
	 * 最新のプロフィール (ローカル 2FA / セキュリティキー) を取得する。
	 * いずれかが失効していれば null を返し、ログインコードは受け付けない。
	 */
	@bindThis
	public async revalidateLoginCode(pending: { userId: string; provider: string; subject: string }): Promise<{
		provider: SsoProviderConfig;
		profile: MiUserProfile | null;
		securityKeysAvailable: boolean;
	} | null> {
		let provider: SsoProviderConfig;
		try {
			provider = await this.getProviderConfig(pending.provider);
		} catch {
			return null;
		}
		const link = await this.userSsoLinkRepository.findOneBy({
			provider: pending.provider,
			providerUserId: pending.subject,
		});
		if (!link || link.userId !== pending.userId) {
			return null;
		}
		const profile = await this.userProfilesRepository.findOneBy({ userId: pending.userId });
		const securityKeysAvailable = await this.userSecurityKeysRepository.countBy({ userId: pending.userId }).then(result => result >= 1);
		return { provider, profile, securityKeysAvailable };
	}

	/**
	 * 追加認証の失敗をコード単位で記録するサーバー側の上限 (フロントの入力回数制限は防御ではない)。
	 * 規定回数に達したらログインコード自体を失効させ、以降の試行を INVALID_CODE にする。
	 */
	@bindThis
	public async recordAdditionalAuthFailure(loginCode: string): Promise<void> {
		const key = `sso:loginCodeAttempts:${loginCode}`;
		const attempts = await this.redisClient.incr(key);
		if (attempts === 1) {
			await this.redisClient.expire(key, LOGIN_CODE_TTL_SEC);
		}
		if (attempts >= MAX_ADDITIONAL_AUTH_ATTEMPTS) {
			await this.redisClient.del(`sso:loginCode:${loginCode}`);
		}
	}

	/** ログインコードを原子的に消費する。既に消費済み (同時リクエストの敗北側) なら false */
	@bindThis
	public async consumeLoginCode(loginCode: string): Promise<boolean> {
		return (await this.redisClient.getdel(`sso:loginCode:${loginCode}`)) != null;
	}

	/**
	 * SSO ログインの追加認証 (ローカル 2FA の TOTP / バックアップコード) を検証する。
	 * 認証に成功するまではログインコードを消費しない。
	 */
	@bindThis
	public async verifyAdditionalAuth(userId: string, token: string): Promise<boolean> {
		const profile = await this.userProfilesRepository.findOneBy({ userId });
		if (profile == null || !profile.twoFactorEnabled) {
			return true;
		}
		try {
			await this.userAuthService.twoFactorAuthenticate(profile, token);
			return true;
		} catch {
			return false;
		}
	}

	/** IdP から安定識別子 (sub 相当) を取得する */
	private async fetchSubject(provider: SsoProviderConfig, code: string, state: string, stateData: SsoState, iss?: string): Promise<string> {
		const redirectUri = this.getRedirectUri(provider.key);

		if (provider.type === 'github') {
			const tokenRes = await this.httpRequestService.send('https://github.com/login/oauth/access_token', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json',
				},
				body: JSON.stringify({
					client_id: provider.clientId,
					client_secret: provider.clientSecret,
					code,
					redirect_uri: redirectUri,
				}),
			});
			const tokenData = await tokenRes.json() as { access_token?: string; error?: string; error_description?: string };
			if (!tokenData.access_token) {
				throw new SsoError('TOKEN_EXCHANGE_FAILED', `GitHub token exchange failed: ${tokenData.error_description ?? tokenData.error ?? 'unknown'}`);
			}

			const userRes = await this.httpRequestService.send('https://api.github.com/user', {
				headers: {
					'Authorization': `Bearer ${tokenData.access_token}`,
					'Accept': 'application/vnd.github+json',
				},
			});
			const user = await userRes.json() as { id?: number };
			if (user.id == null) {
				throw new SsoError('IDENTITY_FETCH_FAILED', 'GitHub user response has no id');
			}
			return String(user.id);
		}

		if (provider.type === 'discord') {
			const tokenRes = await this.httpRequestService.send('https://discord.com/api/oauth2/token', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					client_id: provider.clientId,
					client_secret: provider.clientSecret,
					grant_type: 'authorization_code',
					code,
					redirect_uri: redirectUri,
				}).toString(),
			});
			const tokenData = await tokenRes.json() as { access_token?: string; error?: string; error_description?: string };
			if (!tokenData.access_token) {
				throw new SsoError('TOKEN_EXCHANGE_FAILED', `Discord token exchange failed: ${tokenData.error_description ?? tokenData.error ?? 'unknown'}`);
			}

			const userRes = await this.httpRequestService.send('https://discord.com/api/users/@me', {
				headers: {
					'Authorization': `Bearer ${tokenData.access_token}`,
				},
			});
			const user = await userRes.json() as { id?: string };
			if (!user.id) {
				throw new SsoError('IDENTITY_FETCH_FAILED', 'Discord user response has no id');
			}
			return user.id;
		}

		// google / oidc
		const oidcConfig = await this.getOidcConfiguration(provider);
		const currentUrl = new URL(`${redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}${iss ? `&iss=${encodeURIComponent(iss)}` : ""}`);
		const tokenResponse = await authorizationCodeGrant(oidcConfig, currentUrl, {
			pkceCodeVerifier: stateData.codeVerifier,
			expectedNonce: stateData.nonce,
			expectedState: state,
		});

		const sub = tokenResponse.claims()?.sub;
		if (!sub) {
			throw new SsoError('IDENTITY_FETCH_FAILED', 'No sub claim in ID token');
		}
		return sub;
	}

	/** 連携用の認可URLを発行する (要ログイン)。binding はフロントエンドがブラウザのCookieに設定する */
	@bindThis
	public async linkAccount(userId: string, providerKey: string): Promise<{ authorizationUrl: string; binding: string }> {
		return this.initiate('link', providerKey, userId);
	}

	@bindThis
	public async unlinkAccount(userId: string, providerKey: string): Promise<void> {
		const result = await this.userSsoLinkRepository.delete({ userId, provider: providerKey });
		if (result.affected === 0) {
			throw new SsoError('NOT_LINKED', 'This user is not linked to this provider');
		}
		this.logger.info(`Unlinked SSO account (provider=${providerKey}) from user ${userId}`);
	}

	@bindThis
	public async getStatus(userId: string): Promise<{ links: { provider: string; providerUserId: string; createdAt: string }[] }> {
		const links = await this.userSsoLinkRepository.findBy({ userId });
		return {
			links: links.map(l => ({
				provider: l.provider,
				providerUserId: l.providerUserId,
				createdAt: l.createdAt.toISOString(),
			})),
		};
	}
}
