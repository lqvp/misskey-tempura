/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import {
	discovery,
	buildAuthorizationUrl,
	authorizationCodeGrant,
	fetchUserInfo,
	randomPKCECodeVerifier,
	calculatePKCECodeChallenge,
	randomState,
	type Configuration,
} from 'openid-client';
import { DI } from '@/di-symbols.js';
import type {
	UserOidcLinkRepository,
	UsersRepository,
} from '@/models/_.js';
import type { Config } from '@/config.js';
import type { MiLocalUser } from '@/models/User.js';
import { IdService } from '@/core/IdService.js';
import { bindThis } from '@/decorators.js';
import { MetaService } from '@/core/MetaService.js';
import Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';
import { SigninService } from './SigninService.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

interface OidcState {
	state: string;
	codeVerifier: string;
	type: 'login' | 'link';
	userId?: string;
	createdAt: number;
}

interface OidcLoginCode {
	token: string;
	createdAt: number;
}

@Injectable()
export class OidcService {
	private logger: Logger;
	private config_cache: Configuration | null = null;
	private configPromise: Promise<Configuration> | null = null;
	private pendingStates = new Map<string, OidcState>();
	private pendingLoginCodes = new Map<string, OidcLoginCode>();

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userOidcLinkRepository)
		private userOidcLinkRepository: UserOidcLinkRepository,

		private idService: IdService,
		private metaService: MetaService,
		private signinService: SigninService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('oidc');

		setInterval(() => this.cleanupExpiredStates(), 60 * 1000);
	}

	private cleanupExpiredStates(): void {
		const now = Date.now();
		for (const [key, state] of this.pendingStates) {
			if (now - state.createdAt > 10 * 60 * 1000) {
				this.pendingStates.delete(key);
			}
		}
		for (const [key, loginCode] of this.pendingLoginCodes) {
			if (now - loginCode.createdAt > 5 * 60 * 1000) {
				this.pendingLoginCodes.delete(key);
			}
		}
	}

	@bindThis
	public async getConfig(): Promise<Configuration> {
		if (this.config_cache) return this.config_cache;
		if (this.configPromise) return this.configPromise;

		this.configPromise = (async () => {
			try {
				const meta = await this.metaService.fetch(true);
				if (!meta.oidcEnabled || !meta.oidcIssuerUrl || !meta.oidcClientId || !meta.oidcClientSecret) {
					throw new Error('OIDC is not configured');
				}

				this.config_cache = await discovery(
					new URL(meta.oidcIssuerUrl),
					meta.oidcClientId,
					meta.oidcClientSecret,
				);

				return this.config_cache;
			} finally {
				this.configPromise = null;
			}
		})();

		return this.configPromise;
	}

	@bindThis
	public resetConfig(): void {
		this.config_cache = null;
		this.configPromise = null;
	}

	@bindThis
	public async initiate(type: 'login' | 'link', userId?: string): Promise<string> {
		const oidcConfig = await this.getConfig();
		const state = randomState();
		const codeVerifier = randomPKCECodeVerifier();
		const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

		this.pendingStates.set(state, {
			state,
			codeVerifier,
			type,
			userId,
			createdAt: Date.now(),
		});

		const authorizationUrl = buildAuthorizationUrl(oidcConfig, {
			scope: 'openid email profile',
			state,
			code_challenge: codeChallenge,
			code_challenge_method: 'S256',
			redirect_uri: `${this.config.url}/oidc/callback`,
		});

		return authorizationUrl.toString();
	}

	@bindThis
	public async handleCallback(
		request: FastifyRequest,
		reply: FastifyReply,
		code: string,
		state: string,
	): Promise<{ type: 'login'; loginCode: string } | { type: 'link'; userId: string }> {
		const stateData = this.pendingStates.get(state);
		if (!stateData) {
			throw new Error('Invalid or expired state');
		}
		this.pendingStates.delete(state);

		const oidcConfig = await this.getConfig();
		const currentUrl = new URL(`${this.config.url}/oidc/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);

		const tokenResponse = await authorizationCodeGrant(oidcConfig, currentUrl, {
			expectedState: state,
			pkceCodeVerifier: stateData.codeVerifier,
		});

		const expectedSub = tokenResponse.claims()?.sub;
		if (!expectedSub) {
			throw new Error('No sub claim in ID token');
		}

		const userinfo = await fetchUserInfo(oidcConfig, tokenResponse.access_token, expectedSub);
		const sub = expectedSub;

		const meta = await this.metaService.fetch(true);
		const issuer = meta.oidcIssuerUrl!;

		if (stateData.type === 'link') {
			if (!stateData.userId) {
				throw new Error('Missing userId for link flow');
			}

			const existingLink = await this.userOidcLinkRepository.findOneBy({
				issuer,
				providerUserId: sub,
			});
			if (existingLink) {
				throw new Error('This OIDC account is already linked to another user');
			}

			const existingUserLink = await this.userOidcLinkRepository.findOneBy({
				userId: stateData.userId,
				issuer,
			});
			if (existingUserLink) {
				throw new Error('This user is already linked to an OIDC account');
			}

			await this.userOidcLinkRepository.insert({
				id: this.idService.gen(),
				userId: stateData.userId,
				provider: 'oidc',
				issuer,
				providerUserId: sub,
				createdAt: new Date(),
			});

			return { type: 'link', userId: stateData.userId };
		}

		const link = await this.userOidcLinkRepository.findOneBy({
			issuer,
			providerUserId: sub,
		});
		if (!link) {
			throw new Error('No account linked to this OIDC identity');
		}

		const user = await this.usersRepository.findOneBy({
			id: link.userId,
			host: IsNull(),
		}) as MiLocalUser | null;

		if (!user) {
			throw new Error('Linked user not found');
		}

		if (user.isSuspended) {
			throw new Error('User is suspended');
		}

		this.signinService.signin(request, reply, user);

		const loginCode = randomState();
		this.pendingLoginCodes.set(loginCode, {
			token: user.token!,
			createdAt: Date.now(),
		});

		return { type: 'login', loginCode };
	}

	@bindThis
	public exchangeLoginCode(loginCode: string): string | null {
		const data = this.pendingLoginCodes.get(loginCode);
		if (!data) {
			return null;
		}
		this.pendingLoginCodes.delete(loginCode);
		return data.token;
	}

	@bindThis
	public async linkAccount(userId: string): Promise<string> {
		return this.initiate('link', userId);
	}

	@bindThis
	public async unlinkAccount(userId: string): Promise<void> {
		const meta = await this.metaService.fetch(true);
		const issuer = meta.oidcIssuerUrl!;
		await this.userOidcLinkRepository.delete({ userId, issuer });
	}

	@bindThis
	public async getStatus(userId: string): Promise<{ linked: boolean; providerUserId?: string }> {
		const meta = await this.metaService.fetch(true);
		const issuer = meta.oidcIssuerUrl!;
		const link = await this.userOidcLinkRepository.findOneBy({
			userId,
			issuer,
		});
		if (link) {
			return { linked: true, providerUserId: link.providerUserId };
		}
		return { linked: false };
	}
}
