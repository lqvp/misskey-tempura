/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { QuoteMutingsRepository } from '@/models/_.js';
import type { MiQuoteMuting } from '@/models/QuoteMuting.js';

import { IdService } from '@/core/IdService.js';
import type { MiUser } from '@/models/User.js';
import type { MiMeta } from '@/models/Meta.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { RoleService } from '@/core/RoleService.js';
import { CacheService } from '@/core/CacheService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';

@Injectable()
export class UserQuoteMutingService {
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.quoteMutingsRepository)
		private quoteMutingsRepository: QuoteMutingsRepository,

		private roleService: RoleService,
		private idService: IdService,
		private cacheService: CacheService,
	) {
	}

	@bindThis
	public async mute(user: MiUser, target: MiUser, expiresAt: Date | null = null): Promise<void> {
		// フォロー解除できない（＝リノートミュートもできない）ユーザーの場合
		if (
			user.host == null &&
			this.serverSettings.forciblyFollowedUsers.includes(target.id) &&
			!await this.roleService.isModerator(user)
		) {
			throw new IdentifiableError('15273a89-374d-49fa-8df6-8bb3feeea455', 'You cannot mute that user due to server policy.');
		}

		await this.quoteMutingsRepository.insert({
			id: this.idService.gen(),
			muterId: user.id,
			muteeId: target.id,
		});

		await this.cacheService.quoteMutingsCache.refresh(user.id);
	}

	@bindThis
	public async unmute(mutings: MiQuoteMuting[]): Promise<void> {
		if (mutings.length === 0) return;

		await this.quoteMutingsRepository.delete({
			id: In(mutings.map(m => m.id)),
		});

		const muterIds = [...new Set(mutings.map(m => m.muterId))];
		for (const muterId of muterIds) {
			await this.cacheService.quoteMutingsCache.refresh(muterId);
		}
	}
}
