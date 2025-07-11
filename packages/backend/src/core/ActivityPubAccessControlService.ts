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
import type { FastifyRequest } from 'fastify';

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

	/**
	 * リクエストからリモートホストを推測
	 * User-Agentや他のヘッダーから推測
	 */
	@bindThis
	private extractRemoteHostFromRequest(request: FastifyRequest): string | null {
		const userAgent = request.headers['user-agent'];

		if (!userAgent || typeof userAgent !== 'string') {
			return null;
		}

		for (const pattern of ActivityPubAccessControlService.userAgentPatterns) {
			const match = userAgent.match(pattern);
			if (match && match[1]) {
				const host = match[1].toLowerCase();
				// 自分自身からのリクエストは除外
				if (host === this.config.host.toLowerCase()) {
					return null;
				}
				return this.utilityService.toPuny(host);
			}
		}

		return null;
	}

	/**
	 * リモートインスタンスのアクセス制限設定をチェック
	 */
	@bindThis
	private async checkInstanceRestrictions(host: string): Promise<{
		isBlocked: boolean;
		isSilenced: boolean;
		isQuarantined: boolean;
		reason?: string;
	}> {
		const isBlocked = this.utilityService.isBlockedHost(this.meta.blockedHosts, host);
		if (isBlocked) {
			return { isBlocked: true, isSilenced: false, isQuarantined: false, reason: 'blocked' };
		}

		const isSilenced = this.utilityService.isSilencedHost(this.meta.silencedHosts, host);

		const instance = await this.instancesRepository.findOneBy({ host });
		const isQuarantined = instance?.quarantineLimited ?? false;

		return {
			isBlocked: false,
			isSilenced,
			isQuarantined,
			reason: isQuarantined ? 'quarantined' : isSilenced ? 'silenced' : undefined,
		};
	}

	/**
	 * ActivityPubリクエストのアクセス制御を行います
	 * @param request FastifyRequest
	 * @returns アクセス許可の場合はnull、拒否の場合は理由を含むオブジェクト
	 */
	@bindThis
	public async checkAccess(request: FastifyRequest): Promise<{
		blocked: boolean;
		reason: string;
		host?: string;
	} | null> {
		const remoteHost = this.extractRemoteHostFromRequest(request);

		if (!remoteHost) {
			// リモートホストが特定できない場合はアクセスを許可
			// (通常のブラウザーやその他のクライアントからのアクセス)
			return null;
		}

		// インスタンス制限をチェック
		const restrictions = await this.checkInstanceRestrictions(remoteHost);

		// ブロック、サイレンス、隔離のいずれかが有効な場合はアクセス拒否
		if (restrictions.isBlocked || restrictions.isSilenced || restrictions.isQuarantined) {
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
}
