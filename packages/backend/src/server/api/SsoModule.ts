/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Module } from '@nestjs/common';
import { CoreModule } from '@/core/CoreModule.js';
import { RepositoryModule } from '@/models/RepositoryModule.js';
import { SsoService } from './SsoService.js';

@Module({
	imports: [
		CoreModule,
		RepositoryModule,
	],
	providers: [
		SsoService,
	],
	exports: [
		SsoService,
	],
})
export class SsoModule {
}
