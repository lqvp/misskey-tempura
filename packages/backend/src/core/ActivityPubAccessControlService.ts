/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import httpSignature from '@peertube/http-signature';
import { DI } from '@/di-symbols.js';
import type { InstancesRepository, MiMeta } from '@/models/_.js';
import type { Config } from '@/config.js';
import { UtilityService } from '@/core/UtilityService.js';
import { ApDbResolverService } from '@/core/activitypub/ApDbResolverService.js';
import { bindThis } from '@/decorators.js';
import type Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { MiNote } from '@/models/Note.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

type ParsedSignature = ReturnType<typeof httpSignature.parseRequest>;

type Requester = {
	/** 署名の keyId か User-Agent から読み取った相手のホスト。自己申告なので拒否の判定にしか使わない */
	claimedHost: string | null;
	signature: ParsedSignature | null;
};

/**
 * ActivityPub の取得リクエストの相手を判定し、ブロックや配送先の指定に従ってアクセスを制御する。
 *
 * 相手のホストは 2 段階で扱う:
 * - 自己申告のホスト (署名の keyId や User-Agent): 偽っても拒否されるのは偽った側なので、拒否の判定に使う
 * - 検証済みのホスト (HTTP Signature を検証できたもの): 許可の判定 (配送先 include リスト、署名必須モード) に使う
 */
@Injectable()
export class ActivityPubAccessControlService {
	private logger: Logger;

	private static readonly userAgentPatterns: readonly RegExp[] = [
		// Mastodon
		/http\.rb\/[\d.]+\s+\(Mastodon\/[\d.]+;\s+\+https?:\/\/([^/\)]+)/i,
		// Pleroma
		/Pleroma\s+[\d.]+;\s+https?:\/\/([^/\s<]+)/i,
		// Misskey
		/Misskey\/[\d.]+\s+\(https?:\/\/([^/\)]+)/i,
		// Pixelfed
		/pixelfed\/[\d.]+\s+\(https?:\/\/([^/\)]+)/i,
		// Friendica
		/friendica-[\d.]+\s+\(https?:\/\/([^/\)]+)/i,
		// Generic ActivityPub pattern: contains hostname (厳密化)
		/https?:\/\/([a-zA-Z0-9.-]+[a-zA-Z0-9])/i,
	];

	// checkAccess と checkNoteAccess が同じリクエストで呼ばれるので、解析と検証の結果をリクエストごとに使い回す
	private requesterCache = new WeakMap<FastifyRequest, Requester>();
	private verifiedHostCache = new WeakMap<FastifyRequest, Promise<string | null>>();

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		private utilityService: UtilityService,
		private apDbResolverService: ApDbResolverService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('ap-access-control');
	}

	@bindThis
	public async checkNoteAccess(note: MiNote, request: FastifyRequest): Promise<boolean> {
		const deliveryTargets = note.deliveryTargets;
		const hasDeliveryTargets = deliveryTargets != null && Array.isArray(deliveryTargets.hosts);

		// include リストは「指定したサーバーにだけ見せる」ので、署名を検証できた相手だけ通す
		if (hasDeliveryTargets && deliveryTargets.mode === 'include') {
			const verifiedHost = await this.getVerifiedHost(request);
			if (verifiedHost == null || !deliveryTargets.hosts.includes(verifiedHost)) {
				this.logger.info(`Access to note ${note.id} denied for ${verifiedHost ?? 'unverified requester'} (not in include list)`);
				return false;
			}
		}

		const remoteHost = this.getRequester(request).claimedHost;
		if (remoteHost == null) {
			return true;
		}

		const restrictions = await this.checkInstanceRestrictions(remoteHost);
		if (restrictions.isBlocked || restrictions.isSuspended) {
			this.logger.info(`Access to note ${note.id} denied for ${remoteHost}: ${restrictions.reason}`);
			return false;
		}

		if (restrictions.isQuarantined && !['public', 'home'].includes(note.visibility)) {
			this.logger.info(`Access to note ${note.id} denied for ${remoteHost}: quarantined and not public`);
			return false;
		}

		if (hasDeliveryTargets && deliveryTargets.mode !== 'include' && deliveryTargets.hosts.includes(remoteHost)) {
			this.logger.info(`Access to note ${note.id} denied for ${remoteHost} (in exclude list)`);
			return false;
		}

		return true;
	}

	/**
	 * ActivityPubリクエストかどうかを判定する
	 * Accept ヘッダーに application/ld+json が含まれているかチェック
	 */
	@bindThis
	private isActivityPubRequest(request: FastifyRequest): boolean {
		const acceptHeader = request.headers.accept;
		if (!acceptHeader || typeof acceptHeader !== 'string') {
			return false;
		}

		// application/ld+json, application/activity+json を含むかチェック
		return acceptHeader.includes('application/ld+json') || acceptHeader.includes('application/activity+json');
	}

	/**
	 * HTTP Signature を解析する。検証はしない
	 */
	@bindThis
	private parseSignature(request: FastifyRequest): ParsedSignature | null {
		if (request.headers.signature == null || request.raw == null) return null;

		try {
			const signature = httpSignature.parseRequest(request.raw, { 'headers': ['(request-target)', 'host', 'date'], authorizationHeaderName: 'signature' });
			// 他のサーバー宛ての署名を使い回されないように、host が署名に含まれていて自分宛てであることを確かめる
			if (!signature.params.headers.includes('host') || request.headers.host !== this.config.host) {
				return null;
			}
			return signature;
		} catch (err) {
			this.logger.debug(`Failed to parse HTTP signature: ${err}`);
			return null;
		}
	}

	@bindThis
	private hostFromKeyId(keyId: string): string | null {
		try {
			return this.utilityService.toPuny(new URL(keyId).hostname);
		} catch {
			return null;
		}
	}

	/**
	 * リクエストから相手のホスト (自己申告) を読み取る。署名の keyId を優先し、無ければ User-Agent から推測する
	 */
	@bindThis
	private getRequester(request: FastifyRequest): Requester {
		const cached = this.requesterCache.get(request);
		if (cached) return cached;

		const signature = this.parseSignature(request);
		let claimedHost = signature ? this.hostFromKeyId(signature.keyId) : this.extractHostFromUserAgent(request);

		// 自分自身からのリクエストは除外
		if (claimedHost != null && claimedHost === this.utilityService.toPuny(this.config.host)) {
			claimedHost = null;
		}

		const requester = { claimedHost, signature };
		this.requesterCache.set(request, requester);
		return requester;
	}

	/**
	 * User-Agent から相手のホストを推測する (ActivityPub リクエストのみ)
	 */
	@bindThis
	private extractHostFromUserAgent(request: FastifyRequest): string | null {
		if (!this.isActivityPubRequest(request)) {
			return null;
		}

		const userAgent = request.headers['user-agent'];
		if (!userAgent || typeof userAgent !== 'string') {
			return null;
		}

		for (const pattern of ActivityPubAccessControlService.userAgentPatterns) {
			const match = userAgent.match(pattern);
			if (match && match[1]) {
				return this.utilityService.toPuny(match[1].toLowerCase());
			}
		}

		return null;
	}

	/**
	 * HTTP Signature を検証し、検証できた相手のホストを返す。検証できなければ null。
	 * 鍵を知らない相手はアカウントを取得して鍵を得るので、本当に検証が必要なときだけ呼ぶこと
	 */
	@bindThis
	private getVerifiedHost(request: FastifyRequest): Promise<string | null> {
		const cached = this.verifiedHostCache.get(request);
		if (cached) return cached;

		const promise = this.verifyRequester(request);
		this.verifiedHostCache.set(request, promise);
		return promise;
	}

	@bindThis
	private async verifyRequester(request: FastifyRequest): Promise<string | null> {
		const { signature, claimedHost } = this.getRequester(request);
		if (signature == null || claimedHost == null) return null;

		// ブロックしているサーバーのアカウントは取りに行かない
		if (!this.utilityService.isFederationAllowedHost(claimedHost)) return null;

		let authUser: Awaited<ReturnType<ApDbResolverService['getAuthUserFromApId']>> = await this.apDbResolverService.getAuthUserFromKeyId(signature.keyId);
		if (authUser == null) {
			try {
				// keyId は通常 "<actor>#main-key" の形
				authUser = await this.apDbResolverService.getAuthUserFromApId(signature.keyId.replace(/#.*$/, ''));
			} catch (err) {
				this.logger.debug(`Failed to resolve signer ${signature.keyId}: ${err}`);
				return null;
			}
		}

		if (authUser?.key == null) return null;
		if (!httpSignature.verifySignature(signature, authUser.key.keyPem)) return null;

		const host = authUser.user.host != null ? this.utilityService.toPuny(authUser.user.host) : null;
		// 署名者のホストと keyId のホストが食い違う場合は信用しない
		if (host == null || host !== claimedHost) return null;

		return host;
	}

	/**
	 * リモートインスタンスのアクセス制限設定をチェック
	 */
	@bindThis
	private async checkInstanceRestrictions(host: string): Promise<{
		isBlocked: boolean;
		isSuspended: boolean;
		isQuarantined: boolean;
		reason?: string;
	}> {
		const isBlocked = this.utilityService.isBlockedHost(this.meta.blockedHosts, host);
		if (isBlocked) {
			return { isBlocked: true, isSuspended: false, isQuarantined: false, reason: 'blocked' };
		}

		const instance = await this.instancesRepository.findOneBy({ host });
		// 未登録ホストは制限なし
		const isSuspended = instance != null && instance.suspensionState !== 'none';
		const isQuarantined = instance?.quarantineLimited ?? false;

		return {
			isBlocked: false,
			isSuspended,
			isQuarantined,
			reason: isSuspended ? 'suspended' : isQuarantined ? 'quarantined' : undefined,
		};
	}

	/**
	 * ActivityPubリクエストのアクセス制御を行います
	 * @param request FastifyRequest
	 * @param allowLimitedHosts 隔離中のサーバーからのアクセスを許可するかどうか
	 * @param requireSignature 署名必須モードのときに署名を求めるかどうか。アカウントや公開鍵の取得では鍵の交換ができなくなるので false にする
	 * @returns アクセス許可の場合はnull、拒否の場合は理由を含むオブジェクト
	 */
	@bindThis
	public async checkAccess(request: FastifyRequest, allowLimitedHosts = false, requireSignature = true): Promise<{
		blocked: boolean;
		reason: string;
		host?: string;
	} | null> {
		let remoteHost = this.getRequester(request).claimedHost;

		if (this.meta.requireSignedApFetch && requireSignature) {
			const verifiedHost = await this.getVerifiedHost(request);
			if (verifiedHost == null) {
				this.logger.info('ActivityPub access denied: signature required', { path: request.url });
				return { blocked: true, reason: 'signatureRequired' };
			}
			remoteHost = verifiedHost;
		}

		if (!remoteHost) {
			// リモートホストが特定できない場合はアクセスを許可
			// (通常のブラウザーやその他のクライアントからのアクセス)
			return null;
		}

		const restrictions = await this.checkInstanceRestrictions(remoteHost);

		// isBlocked, isSuspended は常に拒否。isQuarantined は allowLimitedHosts が false のときだけ拒否する
		const shouldDeny = restrictions.isBlocked || restrictions.isSuspended || (restrictions.isQuarantined && !allowLimitedHosts);

		if (shouldDeny) {
			this.logger.info(`ActivityPub access denied from ${remoteHost}: ${restrictions.reason}`, {
				host: remoteHost,
				reason: restrictions.reason,
				userAgent: request.headers['user-agent'],
				path: request.url,
			});

			return {
				blocked: true,
				reason: restrictions.reason ?? 'restricted',
				host: remoteHost,
			};
		}

		return null;
	}

	/**
	 * ActivityPubリクエストのアクセス制御を適用します
	 * @param request FastifyRequest
	 * @param reply FastifyReply
	 * @param allowLimitedHosts 隔離中のサーバーからのアクセスを許可するかどうか
	 * @param requireSignature 署名必須モードのときに署名を求めるかどうか
	 * @returns アクセスが拒否された場合はtrue、許可された場合はfalse
	 */
	@bindThis
	public async applyAccessControl(request: FastifyRequest, reply: FastifyReply, allowLimitedHosts = false, requireSignature = true): Promise<boolean> {
		const accessControl = await this.checkAccess(request, allowLimitedHosts, requireSignature);
		if (accessControl) {
			reply.code(accessControl.reason === 'signatureRequired' ? 401 : 404);
			reply.header('Content-Type', 'text/plain; charset=utf-8');
			reply.send(`Access denied: ${accessControl.reason}`);
			return true;
		}
		return false;
	}
}
