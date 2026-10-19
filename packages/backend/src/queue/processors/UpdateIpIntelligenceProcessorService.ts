/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { IpIntelligenceService } from '@/core/IpIntelligenceService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';

@Injectable()
export class UpdateIpIntelligenceProcessorService {
	private logger: Logger;

	constructor(
		private ipIntelligenceService: IpIntelligenceService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('update-ip-intelligence');
	}

	@bindThis
	public async process(): Promise<void> {
		this.logger.info('Updating IP intelligence data...');
		await this.ipIntelligenceService.updateAll();
		this.logger.succ('IP intelligence data updated.');
	}
}
