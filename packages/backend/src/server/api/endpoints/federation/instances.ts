/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { InstancesRepository } from '@/models/_.js';
import { InstanceEntityService } from '@/core/entities/InstanceEntityService.js';
import { MetaService } from '@/core/MetaService.js';
import { RoleService } from '@/core/RoleService.js';
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
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.instancesRepository.createQueryBuilder('instance');
			const metaData = await this.metaService.fetch(true);
			const isRoot = await this.roleService.isAdministrator(me);

			if (!me) {
				// 未認証ユーザーの場合、metaの設定に応じて空配列にする
				if (!metaData.entranceShowFederation) {
					return [];
				}
				// デフォルトのフィルタ条件を強制する
				Object.assign(ps, {
					sort: '+pubSub',
					limit: 20,
					blocked: false,
					suspended: false,
					silenced: false,
					quarantine: false,
					host: null,
					softwareName: null,
					notResponding: false,
					federating: null,
					subscribing: null,
					publishing: null,
					offset: 0,
				});
			} else if (!isRoot) {
				// 一般ユーザーの場合、非Rootユーザー向けに追加の制御を実施
				// 停止済みインスタンス除外
				query.andWhere('instance.suspensionState = :none', { none: 'none' });

				// サイレンス／ブロック済み、隔離済みの除外
				if (metaData.silencedHosts.length > 0) {
					query.andWhere('instance.host NOT IN (:...silenced)', {
						silenced: metaData.silencedHosts,
					});
				}
				query.andWhere('instance.quarantineLimited = FALSE');
				if (metaData.blockedHosts.length > 0) {
					query.andWhere('instance.host NOT IN (:...blocked)', {
						blocked: metaData.blockedHosts,
					});
				}

				// クエリパラメータでの上書きを防止
				const restrictedParams = [ps.suspended, ps.silenced, ps.quarantine, ps.blocked];
				if (restrictedParams.some(p => p !== null && p !== undefined)) {
					return [];
				}
			}

			switch (ps.sort) {
				case '+pubSub':
					query.orderBy('instance.followingCount', 'DESC').addOrderBy('instance.followersCount', 'DESC');
					break;
				case '-pubSub':
					query.orderBy('instance.followingCount', 'ASC').addOrderBy('instance.followersCount', 'ASC');
					break;
				case '+notes':
					query.orderBy('instance.notesCount', 'DESC');
					break;
				case '-notes':
					query.orderBy('instance.notesCount', 'ASC');
					break;
				case '+users':
					query.orderBy('instance.usersCount', 'DESC');
					break;
				case '-users':
					query.orderBy('instance.usersCount', 'ASC');
					break;
				case '+following':
					query.orderBy('instance.followingCount', 'DESC');
					break;
				case '-following':
					query.orderBy('instance.followingCount', 'ASC');
					break;
				case '+followers':
					query.orderBy('instance.followersCount', 'DESC');
					break;
				case '-followers':
					query.orderBy('instance.followersCount', 'ASC');
					break;
				case '+firstRetrievedAt':
					query.orderBy('instance.firstRetrievedAt', 'DESC');
					break;
				case '-firstRetrievedAt':
					query.orderBy('instance.firstRetrievedAt', 'ASC');
					break;
				case '+latestRequestReceivedAt':
					query.orderBy('instance.latestRequestReceivedAt', 'DESC', 'NULLS LAST');
					break;
				case '-latestRequestReceivedAt':
					query.orderBy('instance.latestRequestReceivedAt', 'ASC', 'NULLS FIRST');
					break;
				default:
					query.orderBy('instance.id', 'DESC');
					break;
			}

			if (typeof ps.blocked === 'boolean') {
				if (ps.blocked) {
					query.andWhere(metaData.blockedHosts.length === 0 ? '1=0' : 'instance.host IN (:...blocks)', {
						blocks: metaData.blockedHosts,
					});
				} else {
					query.andWhere(metaData.blockedHosts.length === 0 ? '1=1' : 'instance.host NOT IN (:...blocks)', {
						blocks: metaData.blockedHosts,
					});
				}
			}

			if (typeof ps.notResponding === 'boolean') {
				query.andWhere(`instance.isNotResponding = ${ps.notResponding ? 'TRUE' : 'FALSE'}`);
			}

			if (typeof ps.suspended === 'boolean') {
				query.andWhere(
					ps.suspended ? 'instance.suspensionState != \'none\'' : 'instance.suspensionState = \'none\'',
				);
			}

			if (typeof ps.quarantine === 'boolean') {
				query.andWhere(`instance.quarantineLimited = ${ps.quarantine ? 'TRUE' : 'FALSE'}`);
			}

			if (typeof ps.silenced === 'boolean') {
				if (ps.silenced) {
					if (metaData.silencedHosts.length === 0) {
						return [];
					}
					query.andWhere('instance.host IN (:...silences)', { silences: metaData.silencedHosts });
				} else if (metaData.silencedHosts.length > 0) {
					query.andWhere('instance.host NOT IN (:...silences)', { silences: metaData.silencedHosts });
				}
			}

			if (typeof ps.federating === 'boolean') {
				query.andWhere(
					ps.federating
						? '((instance.followingCount > 0) OR (instance.followersCount > 0))'
						: '((instance.followingCount = 0) AND (instance.followersCount = 0))',
				);
			}

			if (typeof ps.subscribing === 'boolean') {
				query.andWhere(ps.subscribing ? 'instance.followersCount > 0' : 'instance.followersCount = 0');
			}

			if (typeof ps.publishing === 'boolean') {
				query.andWhere(ps.publishing ? 'instance.followingCount > 0' : 'instance.followingCount = 0');
			}

			if (ps.host) {
				query.andWhere('instance.host like :host', {
					host: '%' + sqlLikeEscape(ps.host.toLowerCase()) + '%',
				});
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
