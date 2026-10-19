/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/Meta.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { IpIntelligenceService } from '@/core/IpIntelligenceService.js';
import { QueueService } from '@/core/QueueService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';

@Injectable()
export class UpdateIpIntelligenceProcessorService implements OnApplicationBootstrap {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		private ipIntelligenceService: IpIntelligenceService,
		private queueService: QueueService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('update-ip-intelligence');
	}

	/** 機能が有効なのにデータが一つも無い場合は、03:30 を待たずに取得する */
	@bindThis
	public async onApplicationBootstrap(): Promise<void> {
		if (!this.meta.enableLoginRiskDetection || !this.config.loginRisk.autoUpdate) return;
		if (this.ipIntelligenceService.getStatus().some(s => s.loaded)) return;

		try {
			// jobId を固定しているので、複数プロセスから呼ばれても重複しない
			await this.queueService.systemQueue.add('updateIpIntelligence', {}, {
				jobId: 'updateIpIntelligence-oneshot',
				removeOnComplete: true,
				removeOnFail: true,
			});
		} catch (err) {
			this.logger.warn(`failed to enqueue the initial IP intelligence update: ${err}`);
		}
	}

	@bindThis
	public async process(): Promise<void> {
		if (!this.meta.enableLoginRiskDetection) {
			this.logger.info('Login risk detection is disabled, skipping IP intelligence update.');
			return;
		}

		this.logger.info('Updating IP intelligence data...');
		await this.ipIntelligenceService.updateAll();
		this.logger.succ('IP intelligence data updated.');
	}
}
