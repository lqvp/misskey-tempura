/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { type MiAvatarDecorationMuting, AvatarDecorationMutingsRepository } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { CacheService } from '@/core/CacheService.js';

@Injectable()
export class AvatarDecorationMutingService {
	constructor(
		@Inject(DI.avatarDecorationMutingsRepository)
		private avatarDecorationMutingsRepository: AvatarDecorationMutingsRepository,

		private idService: IdService,
		private cacheService: CacheService,
	) {
	}

	@bindThis
	public async mute(user: MiUser, target: MiUser): Promise<void> {
		await this.avatarDecorationMutingsRepository.insert({
			id: this.idService.gen(),
			muterId: user.id,
			muteeId: target.id,
		});

		this.cacheService.avatarDecorationMutingsCache.refresh(user.id);
	}

	@bindThis
	public async unmute(mutings: MiAvatarDecorationMuting[]): Promise<void> {
		if (mutings.length === 0) return;

		await this.avatarDecorationMutingsRepository.delete({
			id: In(mutings.map(m => m.id)),
		});

		const muterIds = [...new Set(mutings.map(m => m.muterId))];
		for (const muterId of muterIds) {
			this.cacheService.avatarDecorationMutingsCache.refresh(muterId);
		}
	}
}
