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
	skipSubjectCheck,
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

@Injectable()
export class OidcService {
	private logger: Logger;
	private config_cache: Configuration | null = null;
	private configPromise: Promise<Configuration> | null = null;
	private pendingStates = new Map<string, OidcState>();

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
	}

	@bindThis
	public async getConfig(): Promise<Configuration> {
		if (this.config_cache) return this.config_cache;
		if (this.configPromise) return this.configPromise;

		this.configPromise = (async () => {
			const meta = await this.metaService.fetch(true);
			if (!meta.oidcIssuerUrl || !meta.oidcClientId || !meta.oidcClientSecret) {
				throw new Error('OIDC is not configured');
			}

			this.config_cache = await discovery(
				new URL(meta.oidcIssuerUrl),
				meta.oidcClientId,
				meta.oidcClientSecret,
			);

			this.configPromise = null;
			return this.config_cache;
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
	): Promise<{ type: 'login'; token: string } | { type: 'link'; userId: string }> {
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

		const userinfo = await fetchUserInfo(oidcConfig, tokenResponse.access_token, skipSubjectCheck);
		const sub = userinfo.sub;
		if (!sub) {
			throw new Error('No sub claim in userinfo');
		}

		if (stateData.type === 'link') {
			if (!stateData.userId) {
				throw new Error('Missing userId for link flow');
			}

			const existingLink = await this.userOidcLinkRepository.findOneBy({
				provider: 'oidc',
				providerUserId: sub,
			});
			if (existingLink) {
				throw new Error('This OIDC account is already linked to another user');
			}

			const existingUserLink = await this.userOidcLinkRepository.findOneBy({
				userId: stateData.userId,
				provider: 'oidc',
			});
			if (existingUserLink) {
				throw new Error('This user is already linked to an OIDC account');
			}

			await this.userOidcLinkRepository.insert({
				id: this.idService.gen(),
				userId: stateData.userId,
				provider: 'oidc',
				providerUserId: sub,
				createdAt: new Date(),
			});

			return { type: 'link', userId: stateData.userId };
		}

		const link = await this.userOidcLinkRepository.findOneBy({
			provider: 'oidc',
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

		return { type: 'login', token: user.token! };
	}

	@bindThis
	public async linkAccount(userId: string): Promise<string> {
		return this.initiate('link', userId);
	}

	@bindThis
	public async unlinkAccount(userId: string): Promise<void> {
		await this.userOidcLinkRepository.delete({ userId });
	}

	@bindThis
	public async getStatus(userId: string): Promise<{ linked: boolean; providerUserId?: string }> {
		const link = await this.userOidcLinkRepository.findOneBy({
			userId,
			provider: 'oidc',
		});
		if (link) {
			return { linked: true, providerUserId: link.providerUserId };
		}
		return { linked: false };
	}
}
