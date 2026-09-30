/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { InstancesRepository, MiMeta } from '@/models/_.js';
import { UtilityService } from '@/core/UtilityService.js';
import { bindThis } from '@/decorators.js';
import type Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { MiNote } from '@/models/Note.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

@Injectable()
export class ActivityPubAccessControlService {
	private logger: Logger;

	constructor(
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
	public async checkNoteAccess(note: MiNote, request: FastifyRequest, verifiedHost?: string): Promise<boolean> {
		const remoteHost = verifiedHost ? this.utilityService.toPuny(verifiedHost.toLowerCase()) : undefined;
		// Only a cryptographically verified signer can establish request attribution.
		if (remoteHost === undefined) {
			this.logger.info(`Access to note ${note.id} denied for unattributable ActivityPub request`);
			return false;
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
	public async checkAccess(request: FastifyRequest, allowLimitedHosts = false, verifiedHost?: string): Promise<{
		blocked: boolean;
		reason: string;
		host?: string;
	} | null> {
		const userAgent = request.headers['user-agent'];

		const remoteHost = verifiedHost ? this.utilityService.toPuny(verifiedHost.toLowerCase()) : undefined;

		// These checks protect AP routes, including requests without an AP Accept header.
		// User-Agent and unverified keyId values cannot establish attribution.
		if (remoteHost === undefined) {
			this.logger.info(`ActivityPub access denied for unattributable host: ua=${userAgent ?? '(none)'} signed=${request.headers.signature != null} path=${request.url}`);
			return {
				blocked: true,
				reason: 'unattributable',
			};
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
	public async applyAccessControl(request: FastifyRequest, reply: FastifyReply, allowLimitedHosts = false, verifiedHost?: string): Promise<boolean> {
		const accessControl = await this.checkAccess(request, allowLimitedHosts, verifiedHost);
		if (accessControl) {
			reply.code(404);
			reply.header('Content-Type', 'text/plain; charset=utf-8');
			reply.send(`Access denied: ${accessControl.reason}`);
			return true;
		}
		return false;
	}
}
