/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { Repository } from 'typeorm';
import type { MiUser } from '@/models/User.js';
import type { MiMeta } from '@/models/Meta.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { RoleService } from '@/core/RoleService.js';
import { IdService } from '@/core/IdService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';

/**
 * ユーザー単位の「ミュート」系サービス (通常ミュート / アバターデコレーションミュート /
 * クォートミュート) の共通基底クラス。
 *
 * 各サブクラスは repository と cache refresh コールバックを注入するだけでよい。
 */
@Injectable()
export abstract class AbstractUserMutingService<TMuting extends {
	id: string;
	muterId: string;
	muteeId: string;
	expiresAt: Date | null;
}> {
	constructor(
		protected readonly serverSettings: MiMeta,
		protected readonly repository: Repository<TMuting>,
		protected readonly roleService: RoleService,
		protected readonly idService: IdService,
		protected readonly cacheRefresh: (muterId: string) => void | Promise<void>,
	) {
	}

	@bindThis
	public async mute(user: MiUser, target: MiUser, expiresAt: Date | null = null): Promise<void> {
		// フォロー解除できない（＝ミュートもできない）ユーザーの場合
		if (
			user.host == null &&
			this.serverSettings.forciblyFollowedUsers.includes(target.id) &&
			!await this.roleService.isModerator(user)
		) {
			throw new IdentifiableError('15273a89-374d-49fa-8df6-8bb3feeea455', 'You cannot mute that user due to server policy.');
		}

		await this.repository.insert({
			id: this.idService.gen(),
			muterId: user.id,
			muteeId: target.id,
			expiresAt: expiresAt ?? null,
		} as any);

		await this.cacheRefresh(user.id);
	}

	@bindThis
	public async unmute(mutings: TMuting[]): Promise<void> {
		if (mutings.length === 0) return;

		await this.repository.delete({
			id: In(mutings.map(m => m.id)),
		} as any);

		const muterIds = [...new Set(mutings.map(m => m.muterId))];
		for (const muterId of muterIds) {
			await this.cacheRefresh(muterId);
		}
	}
}