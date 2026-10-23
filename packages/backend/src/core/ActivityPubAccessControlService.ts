/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import httpSignature from '@peertube/http-signature';
import { DI } from '@/di-symbols.js';
import type { InstancesRepository, MiMeta, UserPublickeysRepository } from '@/models/_.js';
import type { Config } from '@/config.js';
import { UtilityService } from '@/core/UtilityService.js';
import { ApDbResolverService } from '@/core/activitypub/ApDbResolverService.js';
import { ApResolverService } from '@/core/activitypub/ApResolverService.js';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import { MemoryKVCache } from '@/misc/cache.js';
import type { MiRemoteUser } from '@/models/User.js';
import type { MiUserPublickey } from '@/models/UserPublickey.js';
import { bindThis } from '@/decorators.js';
import type Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { MiNote } from '@/models/Note.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

type ParsedSignature = ReturnType<typeof httpSignature.parseRequest>;
type Signer = { user: MiRemoteUser; key: MiUserPublickey | null };

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

	// 未認証の GET から外向きの取得や DB への登録を何度も起こされないよう、
	// 取得に失敗した keyId を覚えておき、同じ keyId への同時取得は 1 回にまとめる
	private failedKeyIds = new MemoryKVCache<true>(1000 * 60 * 10, 10000);
	private resolvingSigners = new Map<string, Promise<Signer | null>>();
	// 鍵の更新に追従するための取り直しは、同じ keyId につき 10 分に 1 回まで
	private refreshedKeyIds = new MemoryKVCache<true>(1000 * 60 * 10, 10000);
	// 署名者 (リモートアクター) の解決結果を短時間キャッシュし、同一 keyId からの連続リクエストでの
	// リモート取得・DB 検索を削減する。鍵の更新時は refreshSignerKey で無効化する。
	private signerCache = new MemoryKVCache<Signer>(1000 * 60 * 5, 10000);

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		@Inject(DI.userPublickeysRepository)
		private userPublickeysRepository: UserPublickeysRepository,

		private utilityService: UtilityService,
		private apDbResolverService: ApDbResolverService,
		private apResolverService: ApResolverService,
		private apPersonService: ApPersonService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('ap-access-control');
	}

	@bindThis
	public async checkNoteAccess(note: MiNote, request: FastifyRequest): Promise<boolean> {
		const deliveryTargets = note.deliveryTargets;
		const hasDeliveryTargets = deliveryTargets != null && Array.isArray(deliveryTargets.hosts);
		const targetHosts = hasDeliveryTargets ? deliveryTargets.hosts.map(h => this.normalizeHost(h)) : [];

		// 安い判定 (自己申告のホストでの拒否) を先にする
		const remoteHost = this.getRequester(request).claimedHost;
		if (remoteHost != null) {
			const restrictions = await this.checkInstanceRestrictions(remoteHost);
			if (restrictions.isBlocked || restrictions.isSuspended) {
				this.logger.info(`Access to note ${note.id} denied for ${remoteHost}: ${restrictions.reason}`);
				return false;
			}

			if (hasDeliveryTargets && deliveryTargets.mode !== 'include' && targetHosts.includes(remoteHost)) {
				this.logger.info(`Access to note ${note.id} denied for ${remoteHost} (in exclude list)`);
				return false;
			}
		}

		// include リストは「指定したサーバーにだけ見せる」ので、署名を検証できた相手だけ通す。
		// 鍵を知らない相手のアカウントを取りに行くのは、名乗ったホストがリストにある場合だけ
		if (hasDeliveryTargets && deliveryTargets.mode === 'include') {
			const canFetchSigner = remoteHost != null && targetHosts.includes(remoteHost);
			const verifiedHost = await this.getVerifiedHost(request, canFetchSigner);
			if (verifiedHost == null || !targetHosts.includes(verifiedHost)) {
				this.logger.info(`Access to note ${note.id} denied for ${verifiedHost ?? 'unverified requester'} (not in include list)`);
				return false;
			}
		}

		return true;
	}

	/**
	 * HTTP 署名を検証できたリモートサーバーからの取得かどうかを返す。
	 * 署名なしの取得(匿名アクセス)と署名済みの取得を区別するために使う。
	 *
	 * 署名者の鍵をまだ知らない場合は、インスタンス登録済み(やり取りしたことがある)
	 * ホストからの署名だけアカウントを取りに行って検証する。requireSignedApFetch 時の
	 * checkAccess と同じ方針で、未登録ホストの署名者は取りに行かず匿名に分類する
	 * (匿名取得が未登録ホストへの外向きの取得を誘発しないようにするため)。
	 */
	@bindThis
	public async isVerifiedRequester(request: FastifyRequest): Promise<boolean> {
		const claimedHost = this.getRequester(request).claimedHost;
		// checkAccess と同じく、知らないホストのアカウントは取りに行かない
		const canFetchSigner = claimedHost != null && await this.instancesRepository.existsBy({ host: claimedHost });
		return (await this.getVerifiedHost(request, canFetchSigner)) != null;
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
			if (!signature.params.headers.includes('host') || !this.isOwnHostHeader(request.headers.host)) {
				return null;
			}
			return signature;
		} catch (err) {
			this.logger.debug(`Failed to parse HTTP signature: ${err}`);
			return null;
		}
	}

	/**
	 * Host ヘッダーが自分宛てか。大文字小文字と https の既定ポートの有無は区別しない
	 */
	@bindThis
	private isOwnHostHeader(hostHeader: string | undefined): boolean {
		if (hostHeader == null) return false;
		const normalized = hostHeader.trim().toLowerCase().replace(/:443$/, '');
		return normalized === this.config.host.toLowerCase();
	}

	@bindThis
	private normalizeHost(host: string): string {
		return this.utilityService.toPuny(host.trim().toLowerCase());
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

		// 自分自身からのリクエストは除外 (keyId や UA から読んだホストにはポートが含まれないので hostname と比べる)
		if (claimedHost != null && claimedHost === this.utilityService.toPuny(this.config.hostname)) {
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
	 * 例外は投げない (検証できなかったものとして扱う)
	 * @param canFetchSigner 鍵を知らない相手のアカウントを取りに行ってよいか
	 */
	@bindThis
	private getVerifiedHost(request: FastifyRequest, canFetchSigner: boolean): Promise<string | null> {
		const cached = this.verifiedHostCache.get(request);
		if (cached) return cached;

		const promise = this.verifyRequester(request, canFetchSigner).catch(err => {
			this.logger.warn(`Failed to verify HTTP signature: ${err}`);
			return null;
		});
		this.verifiedHostCache.set(request, promise);
		return promise;
	}

	@bindThis
	private async verifyRequester(request: FastifyRequest, canFetchSigner: boolean): Promise<string | null> {
		const { signature, claimedHost } = this.getRequester(request);
		if (signature == null || claimedHost == null) return null;

		// ブロックしているサーバーのアカウントは取りに行かない
		if (!this.utilityService.isFederationAllowedHost(claimedHost)) return null;

		let signer: Signer | null = await this.apDbResolverService.getAuthUserFromKeyId(signature.keyId);
		if (signer == null) {
			if (!canFetchSigner) return null;
			signer = await this.resolveSigner(signature.keyId);
		}
		if (signer?.key == null) return null;

		let verified = httpSignature.verifySignature(signature, signer.key.keyPem);
		if (!verified) {
			// 相手が鍵を作り直した場合に備えて、アカウントを取り直してから一度だけ検証し直す
			const refreshedKey = canFetchSigner ? await this.refreshSignerKey(signature.keyId, signer.user) : null;
			if (refreshedKey == null) return null;
			signer = { user: signer.user, key: refreshedKey };
			verified = httpSignature.verifySignature(signature, refreshedKey.keyPem);
			if (!verified) return null;
		}

		const host = signer.user.host != null ? this.normalizeHost(signer.user.host) : null;
		// 署名者のホストと keyId のホストが食い違う場合は信用しない
		if (host == null || host !== claimedHost) return null;

		return host;
	}

	/**
	 * 鍵を知らない署名者のアカウントを取得する。失敗した keyId は一定時間取りに行かず、同時の取得は 1 回にまとめる
	 */
	@bindThis
	private resolveSigner(keyId: string): Promise<Signer | null> {
		if (this.failedKeyIds.get(keyId)) return Promise.resolve(null);

		// 署名者解決結果のキャッシュ (TTL 5 分)。同一 keyId の連続リクエストでのリモート取得を避ける。
		const cachedSigner = this.signerCache.get(keyId);
		if (cachedSigner != null) return Promise.resolve(cachedSigner);

		const inflight = this.resolvingSigners.get(keyId);
		if (inflight) return inflight;

		const promise = (async (): Promise<Signer | null> => {
			try {
				const signer = await this.apDbResolverService.getAuthUserFromApId(await this.actorUriFromKeyId(keyId));
				if (signer?.key == null) {
					this.failedKeyIds.set(keyId, true);
					return null;
				}
				this.signerCache.set(keyId, signer);
				return signer;
			} catch (err) {
				this.logger.debug(`Failed to resolve signer ${keyId}: ${err}`);
				this.failedKeyIds.set(keyId, true);
				return null;
			} finally {
				this.resolvingSigners.delete(keyId);
			}
		})();
		this.resolvingSigners.set(keyId, promise);
		return promise;
	}

	/**
	 * keyId からアカウントの URI を得る。多くの実装は "<actor>#main-key" だが、
	 * GoToSocial などは "<actor>/main-key" のように fragment を使わないので、その場合は鍵の文書の owner を見る
	 */
	@bindThis
	private async actorUriFromKeyId(keyId: string): Promise<string> {
		if (keyId.includes('#')) return keyId.replace(/#.*$/, '');

		const keyObject = await (await this.apResolverService.createResolver()).resolve(keyId) as { id?: unknown; owner?: unknown };
		if (typeof keyObject.owner === 'string') return keyObject.owner;
		if (typeof keyObject.id === 'string') return keyObject.id;
		throw new Error(`cannot find the owner of ${keyId}`);
	}

	/**
	 * 署名者のアカウントを取り直して最新の鍵を返す。同じ keyId につき一定時間に 1 回まで
	 */
	@bindThis
	private async refreshSignerKey(keyId: string, user: MiRemoteUser): Promise<MiUserPublickey | null> {
		if (this.refreshedKeyIds.get(keyId) || user.uri == null) return null;
		this.refreshedKeyIds.set(keyId, true);
		// 鍵を更新するので、キャッシュされた署名者は無効化する
		this.signerCache.delete(keyId);

		await this.apPersonService.updatePerson(user.uri);
		// ApDbResolverService は鍵をメモリにキャッシュしているので、DB から最新の値を読む
		return await this.userPublickeysRepository.findOneBy({ userId: user.id });
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
			// 鍵を知らない相手のアカウントは、やり取りしたことがあるサーバーのものだけ取りに行く
			const canFetchSigner = remoteHost != null && await this.instancesRepository.existsBy({ host: remoteHost });
			const verifiedHost = await this.getVerifiedHost(request, canFetchSigner);
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
			if (accessControl.reason === 'signatureRequired') {
				reply.code(401);
				reply.header('WWW-Authenticate', `Signature realm="${this.config.host}",headers="(request-target) host date"`);
			} else {
				reply.code(404);
			}
			reply.header('Content-Type', 'text/plain; charset=utf-8');
			reply.send(`Access denied: ${accessControl.reason}`);
			return true;
		}
		return false;
	}
}
