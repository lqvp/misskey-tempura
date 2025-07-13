/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import * as Redis from 'ioredis';
import { RedisKVCache } from '@/misc/cache.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { NoteReactionsRepository } from '@/models/_.js';

export type ReactionStat = {
	reaction: string;
	count: number;
};

@Injectable()
export class ReactionStatsCacheService implements OnApplicationShutdown {
	public cache: RedisKVCache<ReactionStat[]>;

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,
		@Inject(DI.noteReactionsRepository)
		private noteReactionsRepository: NoteReactionsRepository,
	) {
		this.cache = new RedisKVCache<ReactionStat[]>(this.redisClient, 'reactionStats', {
			lifetime: 1000 * 60 * 60, // 1h
			memoryCacheLifetime: 1000 * 60 * 5, // 5m
			fetcher: this.fetcher,
			toRedisConverter: (value) => JSON.stringify(value),
			fromRedisConverter: (value) => JSON.parse(value),
		});
	}

	@bindThis
	private async fetcher(key: string): Promise<ReactionStat[]> {
		const [type, id] = key.split(':');
		const limit = 100;

		const query =
			this.noteReactionsRepository.createQueryBuilder('nr')
				.select('nr.reaction', 'reaction')
				.addSelect('count(nr.id)', 'count')
				.groupBy('nr.reaction')
				.orderBy('count', 'DESC')
				.limit(limit);

		if (type === 'user' && id !== '') {
			query.where('nr.userId = :id', { id: id });
		}

		const res = await query.getRawMany();

		return res.map(x => ({
			reaction: x.reaction,
			count: Number(x.count),
		}));
	}

	@bindThis
	public async fetch(key: string): Promise<ReactionStat[]> {
		return await this.cache.fetch(key);
	}

	@bindThis
	public dispose(): void {
		this.cache.dispose();
	}

	@bindThis
	public onApplicationShutdown(): void {
		this.dispose();
	}
}
