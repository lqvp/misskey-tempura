/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiRegistryItem, RegistryItemsRepository } from '@/models/_.js';
import { MiRegistryItem as MiRegistryItemEntity } from '@/models/RegistryItem.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import type { MiUser } from '@/models/User.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { bindThis } from '@/decorators.js';
import type { EntityManager, Repository } from 'typeorm';

@Injectable()
export class RegistryApiService {
	constructor(
		@Inject(DI.registryItemsRepository)
		private registryItemsRepository: RegistryItemsRepository,

		private idService: IdService,
		private globalEventService: GlobalEventService,
	) {
	}

	/**
	 * Write several items of one user in a single transaction. `beforeWrite` runs first inside the same transaction,
	 * so a failure anywhere (including a process stop) leaves nothing behind. Events are published only after commit.
	 */
	@bindThis
	public async setManyAtomically(userId: MiUser['id'], items: { scope: string[]; key: string; value: any }[], beforeWrite?: (em: EntityManager) => Promise<void>) {
		const written: { scope: string[]; key: string; value: any }[] = [];
		await this.registryItemsRepository.manager.transaction(async em => {
			await this.lockSubRegistry(em, userId);
			if (beforeWrite) await beforeWrite(em);
			const repo = em.getRepository(MiRegistryItemEntity);
			for (const item of items) {
				const existing = await repo.createQueryBuilder('item')
					.where('item.domain IS NULL AND item.userId = :userId AND item.key = :key AND item.scope = :scope', { userId, key: item.key, scope: item.scope })
					.getOne();
				// An existing row is the account's own (newer) value: the initial copy never overwrites it
				if (existing) continue;
				await repo.insert({ id: this.idService.gen(), updatedAt: new Date(), userId, domain: null, scope: item.scope, key: item.key, value: item.value });
				written.push(item);
			}
		});
		for (const item of written) {
			this.globalEventService.publishMainStream(userId, 'registryUpdated', { scope: item.scope, key: item.key, value: item.value });
		}
	}

	/**
	 * Sub-accounts only: serialize every registry write of one sub-account (the initial copy and its own set; remove only deletes rows, so it needs no lock)
	 * with a transaction-level advisory lock, so the same key cannot be inserted twice by racing writers.
	 */
	@bindThis
	private async lockSubRegistry(em: EntityManager, userId: MiUser['id']): Promise<void> {
		await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`subaccount:registry:${userId}`]);
	}

	@bindThis
	public async set(userId: MiUser['id'], domain: string | null, scope: string[], key: string, value: any, serializeSubAccountWrites = false) {
		if (serializeSubAccountWrites) {
			await this.registryItemsRepository.manager.transaction(async em => {
				await this.lockSubRegistry(em, userId);
				await this.setWith(em.getRepository(MiRegistryItemEntity), userId, domain, scope, key, value);
			});
		} else {
			await this.setWith(this.registryItemsRepository, userId, domain, scope, key, value);
		}

		if (domain == null) {
			// TODO: サードパーティアプリが傍受出来てしまうのでどうにかする
			this.globalEventService.publishMainStream(userId, 'registryUpdated', {
				scope: scope,
				key: key,
				value: value,
			});
		}
	}

	@bindThis
	private async setWith(repo: Repository<MiRegistryItemEntity>, userId: MiUser['id'], domain: string | null, scope: string[], key: string, value: any) {
		// TODO: 作成できるキーの数を制限する

		const query = repo.createQueryBuilder('item');
		if (domain) {
			query.where('item.domain = :domain', { domain: domain });
		} else {
			query.where('item.domain IS NULL');
		}
		query.andWhere('item.userId = :userId', { userId: userId });
		query.andWhere('item.key = :key', { key: key });
		query.andWhere('item.scope = :scope', { scope: scope });

		const existingItem = await query.getOne();

		if (existingItem) {
			await repo.update(existingItem.id, {
				updatedAt: new Date(),
				value: value,
			});
		} else {
			await repo.insert({
				id: this.idService.gen(),
				updatedAt: new Date(),
				userId: userId,
				domain: domain,
				scope: scope,
				key: key,
				value: value,
			});
		}
	}

	@bindThis
	public async getItem(userId: MiUser['id'], domain: string | null, scope: string[], key: string): Promise<MiRegistryItem | null> {
		const query = this.registryItemsRepository.createQueryBuilder('item')
			.where(domain == null ? 'item.domain IS NULL' : 'item.domain = :domain', { domain: domain })
			.andWhere('item.userId = :userId', { userId: userId })
			.andWhere('item.key = :key', { key: key })
			.andWhere('item.scope = :scope', { scope: scope });

		const item = await query.getOne();

		return item;
	}

	@bindThis
	public async getAllItemsOfScope(userId: MiUser['id'], domain: string | null, scope: string[]): Promise<MiRegistryItem[]> {
		const query = this.registryItemsRepository.createQueryBuilder('item');
		query.where(domain == null ? 'item.domain IS NULL' : 'item.domain = :domain', { domain: domain });
		query.andWhere('item.userId = :userId', { userId: userId });
		query.andWhere('item.scope = :scope', { scope: scope });

		const items = await query.getMany();

		return items;
	}

	@bindThis
	public async getAllKeysOfScope(userId: MiUser['id'], domain: string | null, scope: string[]): Promise<string[]> {
		const query = this.registryItemsRepository.createQueryBuilder('item');
		query.select('item.key');
		query.where(domain == null ? 'item.domain IS NULL' : 'item.domain = :domain', { domain: domain });
		query.andWhere('item.userId = :userId', { userId: userId });
		query.andWhere('item.scope = :scope', { scope: scope });

		const items = await query.getMany();

		return items.map(x => x.key);
	}

	@bindThis
	public async getAllScopeAndDomains(userId: MiUser['id']): Promise<{ domain: string | null; scopes: string[][] }[]> {
		const query = this.registryItemsRepository.createQueryBuilder('item')
			.select(['item.scope', 'item.domain'])
			.where('item.userId = :userId', { userId: userId });

		const items = await query.getMany();

		const res = [] as { domain: string | null; scopes: string[][] }[];

		for (const item of items) {
			const target = res.find(x => x.domain === item.domain);
			if (target) {
				if (target.scopes.some(scope => scope.join('.') === item.scope.join('.'))) continue;
				target.scopes.push(item.scope);
			} else {
				res.push({
					domain: item.domain,
					scopes: [item.scope],
				});
			}
		}

		return res;
	}

	@bindThis
	public async remove(userId: MiUser['id'], domain: string | null, scope: string[], key: string) {
		const query = this.registryItemsRepository.createQueryBuilder().delete();
		if (domain) {
			query.where('domain = :domain', { domain: domain });
		} else {
			query.where('domain IS NULL');
		}
		query.andWhere('userId = :userId', { userId: userId });
		query.andWhere('key = :key', { key: key });
		query.andWhere('scope = :scope', { scope: scope });

		await query.execute();
	}
}
