/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { InstancesRepository, MiMeta } from '@/models/_.js';
import type { Config } from '@/config.js';
import { UtilityService } from '@/core/UtilityService.js';
import { bindThis } from '@/decorators.js';
import type Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { MiNote } from '@/models/Note.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

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

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		private utilityService: UtilityService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('ap-access-control');
	}

	@bindThis
	public async checkNoteAccess(note: MiNote, request: FastifyRequest): Promise<boolean> {
		const remoteHost = this.extractRemoteHostFromRequest(request);
		if (remoteHost == null) {
			// Not a remote request
			return true;
		}

		// まずインスタンスの状態をチェック
		const restrictions = await this.checkInstanceRestrictions(remoteHost);
		if (restrictions.isBlocked || restrictions.isSuspended) {
			this.logger.info(`Access to note ${note.id} denied for ${remoteHost}: ${restrictions.reason}`);
			return false;
		}

		if (restrictions.isQuarantined && !['public', 'home'].includes(note.visibility)) {
			this.logger.info(`Access to note ${note.id} denied for ${remoteHost}: quarantined and not public`);
			return false;
		}

		// deliveryTargetsのチェック
		if (note.deliveryTargets == null || !Array.isArray(note.deliveryTargets.hosts)) {
			return true;
		}

		const deliveryTargets = note.deliveryTargets;

		if (deliveryTargets.mode === 'include') {
			if (!deliveryTargets.hosts.includes(remoteHost)) {
				this.logger.info(`Access to note ${note.id} denied for ${remoteHost} (not in include list)`);
				return false;
			}
		} else { // exclude
			if (deliveryTargets.hosts.includes(remoteHost)) {
				this.logger.info(`Access to note ${note.id} denied for ${remoteHost} (in exclude list)`);
				return false;
			}
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
	 * Signature ヘッダーの keyId からホストを抽出する
	 * keyId は通常 https://<host>/... を指す。署名検証自体は行わないが、
	 * keyId を UA よりも信頼できる帰属情報として扱う（vuln-0017）。
	 */
	@bindThis
	private extractHostFromSignatureHeader(request: FastifyRequest): string | null {
		const signatureHeader = request.headers.signature;
		if (typeof signatureHeader !== 'string') {
			return null;
		}

		const match = signatureHeader.match(/keyId="?https?:\/\/([^/"'\s,]+)/i);
		if (match && match[1]) {
			return this.utilityService.toPuny(match[1].toLowerCase());
		}

		return null;
	}

	/**
	 * リクエストからリモートホストを推測
	 * User-Agentや他のヘッダーから推測（ActivityPubリクエストのみ）
	 */
	@bindThis
	private extractRemoteHostFromRequest(request: FastifyRequest): string | null {
		// まずActivityPubリクエストかどうかをチェック
		if (!this.isActivityPubRequest(request)) {
			this.logger.debug('Not an ActivityPub request (no application/ld+json or application/activity+json in Accept header)');
			return null;
		}

		const userAgent = request.headers['user-agent'];
		const signatureHost = this.extractHostFromSignatureHeader(request);

		// User-Agent からホストを推測
		let userAgentHost: string | null = null;
		if (userAgent && typeof userAgent === 'string') {
			for (const pattern of ActivityPubAccessControlService.userAgentPatterns) {
				const match = userAgent.match(pattern);
				if (match && match[1]) {
					userAgentHost = this.utilityService.toPuny(match[1].toLowerCase());
					break;
				}
			}
		}

		// 署名の keyId を優先する（署名検証を通す限り UA より信頼できる）。
		// keyId と UA が食い違ったら改竦の可能性があるため warn を出す。
		let identified: string | null = null;
		if (signatureHost != null) {
			identified = signatureHost;
			if (userAgentHost != null && userAgentHost !== signatureHost) {
				this.logger.warn(`Host attribution mismatch: signature says ${signatureHost}, User-Agent says ${userAgentHost} (using signature host)`);
			}
		} else if (userAgentHost != null) {
			identified = userAgentHost;
		}

		if (identified == null) {
			this.logger.debug('ActivityPub request detected but host attribution failed (allowing)');
			return null;
		}

		// 自分自身からのリクエストは除外
		if (identified === this.config.host.toLowerCase()) {
			this.logger.debug('Request from self, allowing access');
			return null;
		}

		return identified;
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
	 * @returns アクセス許可の場合はnull、拒否の場合は理由を含むオブジェクト
	 */
	@bindThis
	public async checkAccess(request: FastifyRequest, allowLimitedHosts = false): Promise<{
		blocked: boolean;
		reason: string;
		host?: string;
	} | null> {
		const userAgent = request.headers['user-agent'];
		if (typeof userAgent === 'string' && userAgent.toLowerCase().includes('tempura')) {
			// tempura 同士は UA ベースのアクセス制御を通すと連合が成立しない不具合があるため、
			// バイパスは当面温存する (vuln-0017 の段階移行: まず keyId 優先と改竦ログで観察する)
			this.logger.debug('Bypassing ActivityPub access control for tempura client');
			return null;
		}

		const remoteHost = this.extractRemoteHostFromRequest(request);

		if (!remoteHost) {
			// リモートホストが特定できない場合はアクセスを許可
			// (通常のブラウザーやその他のクライアントからのアクセス)
			if (this.isActivityPubRequest(request)) {
				this.logger.warn(`ActivityPub request with unattributable host (no keyId / UA host): ua=${userAgent ?? '(none)'} signed=${request.headers.signature != null} path=${request.url} — allowed, watch for evasion`);
			}
			this.logger.debug('No remote host detected, allowing access');
			return null;
		}

		this.logger.debug(`Checking access for remote host: ${remoteHost}`);

		// インスタンス制限をチェック
		const restrictions = await this.checkInstanceRestrictions(remoteHost);
		this.logger.debug(`Instance restrictions: ${JSON.stringify(restrictions)}`);

		// isBlocked, isSuspended, isQuarantined は常に拒否。
		const shouldDeny = restrictions.isBlocked || restrictions.isSuspended || restrictions.isQuarantined;
		this.logger.debug(`Should deny access: ${shouldDeny}`);

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

		// デバッグ用：許可されたアクセスもログ出力（verbose level）
		this.logger.debug(`ActivityPub access allowed from ${remoteHost}`, {
			host: remoteHost,
			userAgent: request.headers['user-agent'],
			path: request.url,
		});

		// アクセス許可
		return null;
	}

	/**
	 * ActivityPubリクエストのアクセス制御を適用します
	 * @param request FastifyRequest
	 * @param reply FastifyReply
	 * @param allowLimitedHosts サイレンスされたホストからのアクセスを許可するかどうか
	 * @returns アクセスが拒否された場合はtrue、許可された場合はfalse
	 */
	@bindThis
	public async applyAccessControl(request: FastifyRequest, reply: FastifyReply, allowLimitedHosts = false): Promise<boolean> {
		const accessControl = await this.checkAccess(request, allowLimitedHosts);
		if (accessControl) {
			reply.code(404);
			reply.header('Content-Type', 'text/plain; charset=utf-8');
			reply.send(`Access denied: ${accessControl.reason}`);
			return true;
		}
		return false;
	}
}
