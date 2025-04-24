/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { IsNull, Not } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { FollowingsRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,

	kind: 'read:account',

	description: 'Get the list of servers that follow the user',

	res: {
		type: 'array',
		items: {
			type: 'string',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			// ユーザーのフォロワーを取得
			const followers = await this.followingsRepository.find({
				where: {
					followeeId: me.id,
					followerHost: Not(IsNull()),
				},
				select: {
					followerHost: true,
				},
			});

			// フォロワーのホストのリストを作成（重複を除去）
			const hosts = [...new Set(followers.map(following => following.followerHost).filter(host => host !== null))] as string[];

			return hosts;
		});
	}
}
