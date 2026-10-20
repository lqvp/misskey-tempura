/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { QuoteMutingsRepository } from '@/models/_.js';
import type { MiQuoteMuting } from '@/models/QuoteMuting.js';

import { IdService } from '@/core/IdService.js';
import type { MiUser } from '@/models/User.js';
import type { MiMeta } from '@/models/Meta.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';
import { CacheService } from '@/core/CacheService.js';
import { AbstractUserMutingService } from '@/core/AbstractUserMutingService.js';

@Injectable()
export class UserQuoteMutingService extends AbstractUserMutingService<MiQuoteMuting> {
	constructor(
		@Inject(DI.meta)
		serverSettings: MiMeta,

		@Inject(DI.quoteMutingsRepository)
		quoteMutingsRepository: QuoteMutingsRepository,

		roleService: RoleService,
		idService: IdService,
		cacheService: CacheService,
	) {
		super(
			serverSettings,
			quoteMutingsRepository,
			roleService,
			idService,
			(muterId) => cacheService.quoteMutingsCache.refresh(muterId),
		);
	}
}