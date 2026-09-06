/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { QueueService } from '@/core/QueueService.js';
import { bindThis } from '@/decorators.js';

@Injectable()
export class TruncateAccountService {
	constructor(
		private queueService: QueueService,
	) {
	}

	@bindThis
	public async truncateAccount(user: {
		id: string;
		host: string | null;
	}): Promise<void> {
		await this.queueService.createTruncateAccountJob(user);
	}
}
