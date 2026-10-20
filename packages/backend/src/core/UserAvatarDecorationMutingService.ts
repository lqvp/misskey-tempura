/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { AvatarDecorationMutingsRepository } from '@/models/_.js';
import type { MiAvatarDecorationMuting } from '@/models/AvatarDecorationMuting.js';

import { IdService } from '@/core/IdService.js';
import type { MiUser } from '@/models/User.js';
import type { MiMeta } from '@/models/Meta.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';
import { CacheService } from '@/core/CacheService.js';
import { AbstractUserMutingService } from '@/core/AbstractUserMutingService.js';

@Injectable()
export class UserAvatarDecorationMutingService extends AbstractUserMutingService<MiAvatarDecorationMuting> {
	constructor(
		@Inject(DI.meta)
		serverSettings: MiMeta,

		@Inject(DI.avatarDecorationMutingsRepository)
		avatarDecorationMutingsRepository: AvatarDecorationMutingsRepository,

		roleService: RoleService,
		idService: IdService,
		cacheService: CacheService,
	) {
		super(
			serverSettings,
			avatarDecorationMutingsRepository,
			roleService,
			idService,
			(muterId) => cacheService.avatarDecorationMutingsCache.refresh(muterId),
		);
	}
}