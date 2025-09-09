/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { AvatarDecorationMutingsRepository, RenoteMutingsRepository, QuoteMutingsRepository, MutingsRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { UserMutingService } from '@/core/UserMutingService.js';
import { UserAvatarDecorationMutingService } from '@/core/UserAvatarDecorationMutingService.js';
import { UserRenoteMutingService } from '@/core/UserRenoteMutingService.js';
import { UserQuoteMutingService } from '@/core/UserQuoteMutingService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';

@Injectable()
export class CheckExpiredMutingsProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		@Inject(DI.avatarDecorationMutingsRepository)
		private avatarDecorationMutingsRepository: AvatarDecorationMutingsRepository,

		@Inject(DI.renoteMutingsRepository)
		private renoteMutingsRepository: RenoteMutingsRepository,

		@Inject(DI.quoteMutingsRepository)
		private quoteMutingsRepository: QuoteMutingsRepository,

		private userAvatarDecorationMutingService: UserAvatarDecorationMutingService,
		private userMutingService: UserMutingService,
		private userRenoteMutingService: UserRenoteMutingService,
		private userQuoteMutingService: UserQuoteMutingService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('check-expired-mutings');
	}

	@bindThis
	public async process(): Promise<void> {
		this.logger.info('Checking expired mutings...');

		const expired = await this.mutingsRepository.createQueryBuilder('muting')
			.where('muting.expiresAt IS NOT NULL')
			.andWhere('muting.expiresAt < :now', { now: new Date() })
			.innerJoinAndSelect('muting.mutee', 'mutee')
			.getMany();

		const expiredAvatarDecorationMutings = await this.avatarDecorationMutingsRepository.createQueryBuilder('avatar_decoration_muting')
			.where('avatar_decoration_muting.expiresAt IS NOT NULL')
			.andWhere('avatar_decoration_muting.expiresAt < :now', { now: new Date() })
			.innerJoinAndSelect('avatar_decoration_muting.mutee', 'mutee')
			.getMany();

		const expiredRenoteMutings = await this.renoteMutingsRepository.createQueryBuilder('renote_muting')
			.where('renote_muting.expiresAt IS NOT NULL')
			.andWhere('renote_muting.expiresAt < :now', { now: new Date() })
			.innerJoinAndSelect('renote_muting.mutee', 'mutee')
			.getMany();

		const expiredQuoteMutings = await this.quoteMutingsRepository.createQueryBuilder('quote_muting')
			.where('quote_muting.expiresAt IS NOT NULL')
			.andWhere('quote_muting.expiresAt < :now', { now: new Date() })
			.innerJoinAndSelect('quote_muting.mutee', 'mutee')
			.getMany();

		if (expired.length > 0) {
			await this.userMutingService.unmute(expired);
		}

		if (expiredAvatarDecorationMutings.length > 0) {
			await this.userAvatarDecorationMutingService.unmute(expiredAvatarDecorationMutings);
		}

		if (expiredRenoteMutings.length > 0) {
			await this.userRenoteMutingService.unmute(expiredRenoteMutings);
		}

		if (expiredQuoteMutings.length > 0) {
			await this.userQuoteMutingService.unmute(expiredQuoteMutings);
		}

		this.logger.succ('All expired mutings checked.');
	}
}
