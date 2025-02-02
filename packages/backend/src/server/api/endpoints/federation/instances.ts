/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { InstancesRepository } from '@/models/_.js';
import { InstanceEntityService } from '@/core/entities/InstanceEntityService.js';
import { MetaService } from '@/core/MetaService.js';
import { DI } from '@/di-symbols.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';

export const meta = {
	tags: ['federation'],

	requireCredential: false,
	kind: 'read:federation',
	allowGet: true,
	cacheSec: 3600,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'FederationInstance',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		host: { type: 'string', nullable: true, description: 'Omit or use `null` to not filter by host.' },
		softwareName: { type: 'string', nullable: true, description: 'Omit or use `null` to not filter by softwareName.' },
		blocked: { type: 'boolean', nullable: true },
		notResponding: { type: 'boolean', nullable: true },
		suspended: { type: 'boolean', nullable: true },
		silenced: { type: 'boolean', nullable: true },
		quarantine: { type: 'boolean', nullable: true },
		federating: { type: 'boolean', nullable: true },
		subscribing: { type: 'boolean', nullable: true },
		publishing: { type: 'boolean', nullable: true },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		offset: { type: 'integer', default: 0 },
		sort: {
			type: 'string',
			nullable: true,
			enum: [
				'+pubSub',
				'-pubSub',
				'+notes',
				'-notes',
				'+users',
				'-users',
				'+following',
				'-following',
				'+followers',
				'-followers',
				'+firstRetrievedAt',
				'-firstRetrievedAt',
				'+latestRequestReceivedAt',
				'-latestRequestReceivedAt',
				null,
			],
		},
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		private instanceEntityService: InstanceEntityService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.instancesRepository.createQueryBuilder('instance');

			if (!me) {
				const meta = await this.metaService.fetch(true);
				if (!meta.entranceShowFederation) {
					return [];
				}
				const allowedParams = (
					ps.sort === '+pubSub' &&
					ps.limit === 20 &&
					ps.blocked === false &&
					ps.offset === 0 &&
					ps.host === null &&
					ps.softwareName === null &&
					ps.notResponding === null &&
					ps.suspended === null &&
					ps.silenced === null &&
					ps.quarantine === null &&
					ps.federating === null &&
					ps.subscribing === null &&
					ps.publishing === null
				);
				if (!allowedParams) {
					return [];
				}
			}

			if (me && !me.isRoot) {
				const meta = await this.metaService.fetch(true);

				// 停止済みインスタンス除外
				query.andWhere('instance.suspensionState = :none', { none: 'none' });

				// サイレンス済みインスタンス除外
				if (meta.silencedHosts.length > 0) {
					query.andWhere('instance.host NOT IN (:...silenced)', {
						silenced: meta.silencedHosts,
					});
				}

				// 隔離済みインスタンス除外
				query.andWhere('instance.quarantineLimited = FALSE');

				// ブロック済みインスタンス除外
				if (meta.blockedHosts.length > 0) {
					query.andWhere('instance.host NOT IN (:...blocked)', {
						blocked: meta.blockedHosts,
					});
				}

				// パラメータによる上書き防止
				const restrictedParams = [
					ps.suspended,
					ps.silenced,
					ps.quarantine,
					ps.blocked,
				];
				if (restrictedParams.some(p => p !== null && p !== undefined)) {
					return [];
				}
			}

			switch (ps.sort) {
				case '+pubSub': query.orderBy('instance.followingCount', 'DESC').orderBy('instance.followersCount', 'DESC'); break;
				case '-pubSub': query.orderBy('instance.followingCount', 'ASC').orderBy('instance.followersCount', 'ASC'); break;
				case '+notes': query.orderBy('instance.notesCount', 'DESC'); break;
				case '-notes': query.orderBy('instance.notesCount', 'ASC'); break;
				case '+users': query.orderBy('instance.usersCount', 'DESC'); break;
				case '-users': query.orderBy('instance.usersCount', 'ASC'); break;
				case '+following': query.orderBy('instance.followingCount', 'DESC'); break;
				case '-following': query.orderBy('instance.followingCount', 'ASC'); break;
				case '+followers': query.orderBy('instance.followersCount', 'DESC'); break;
				case '-followers': query.orderBy('instance.followersCount', 'ASC'); break;
				case '+firstRetrievedAt': query.orderBy('instance.firstRetrievedAt', 'DESC'); break;
				case '-firstRetrievedAt': query.orderBy('instance.firstRetrievedAt', 'ASC'); break;
				case '+latestRequestReceivedAt': query.orderBy('instance.latestRequestReceivedAt', 'DESC', 'NULLS LAST'); break;
				case '-latestRequestReceivedAt': query.orderBy('instance.latestRequestReceivedAt', 'ASC', 'NULLS FIRST'); break;

				default: query.orderBy('instance.id', 'DESC'); break;
			}

			if (typeof ps.blocked === 'boolean') {
				const meta = await this.metaService.fetch(true);
				if (ps.blocked) {
					query.andWhere(meta.blockedHosts.length === 0 ? '1=0' : 'instance.host IN (:...blocks)', { blocks: meta.blockedHosts });
				} else {
					query.andWhere(meta.blockedHosts.length === 0 ? '1=1' : 'instance.host NOT IN (:...blocks)', { blocks: meta.blockedHosts });
				}
			}

			if (typeof ps.notResponding === 'boolean') {
				if (ps.notResponding) {
					query.andWhere('instance.isNotResponding = TRUE');
				} else {
					query.andWhere('instance.isNotResponding = FALSE');
				}
			}

			if (typeof ps.suspended === 'boolean') {
				if (ps.suspended) {
					query.andWhere('instance.suspensionState != \'none\'');
				} else {
					query.andWhere('instance.suspensionState = \'none\'');
				}
			}

			if (typeof ps.quarantine === 'boolean') {
				if (ps.quarantine) {
					query.andWhere('instance.quarantineLimited = TRUE');
				} else {
					query.andWhere('instance.quarantineLimited = FALSE');
				}
			}

			if (typeof ps.silenced === 'boolean') {
				const meta = await this.metaService.fetch(true);

				if (ps.silenced) {
					if (meta.silencedHosts.length === 0) {
						return [];
					}
					query.andWhere('instance.host IN (:...silences)', {
						silences: meta.silencedHosts,
					});
				} else if (meta.silencedHosts.length > 0) {
					query.andWhere('instance.host NOT IN (:...silences)', {
						silences: meta.silencedHosts,
					});
				}
			}

			if (typeof ps.federating === 'boolean') {
				if (ps.federating) {
					query.andWhere('((instance.followingCount > 0) OR (instance.followersCount > 0))');
				} else {
					query.andWhere('((instance.followingCount = 0) AND (instance.followersCount = 0))');
				}
			}

			if (typeof ps.subscribing === 'boolean') {
				if (ps.subscribing) {
					query.andWhere('instance.followersCount > 0');
				} else {
					query.andWhere('instance.followersCount = 0');
				}
			}

			if (typeof ps.publishing === 'boolean') {
				if (ps.publishing) {
					query.andWhere('instance.followingCount > 0');
				} else {
					query.andWhere('instance.followingCount = 0');
				}
			}

			if (ps.host) {
				query.andWhere('instance.host like :host', { host: '%' + sqlLikeEscape(ps.host.toLowerCase()) + '%' });
			}

			if (ps.softwareName) {
				query.andWhere('instance.softwareName like :softwareName', {
					softwareName: '%' + sqlLikeEscape(ps.softwareName.toLowerCase()) + '%',
				});
			}

			const instances = await query.limit(ps.limit).offset(ps.offset).getMany();

			return await this.instanceEntityService.packMany(instances, me);
		});
	}
}
