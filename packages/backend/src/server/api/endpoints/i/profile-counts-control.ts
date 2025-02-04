/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { UsersRepository } from '@/models/_.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['account'],
	secure: true,
	requireCredential: true,
	limit: {
		duration: ms('1hour'),
		max: 1,
	},
	errors: {
		youDontHavePermission: {
			message: 'You don\'t have permission to update counters.',
			code: 'YOU_DONT_HAVE_PERMISSION',
			id: 'b1c7b7a6-6c3d-4c9d-8d1e-9b8b0d4e3f5c',
		},
		invalidValue: {
			message: 'At least one counter value must be provided.',
			code: 'INVALID_VALUE',
			id: '6e4a1b7d-7e3a-4b8c-8f1e-5d2c6d7e8f9a',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		followersCount: { type: 'integer', nullable: true, minimum: 0 },
		followingCount: { type: 'integer', nullable: true, minimum: 0 },
		notesCount: { type: 'integer', nullable: true, minimum: 0 },
	},
	anyOf: [
		{ required: ['followersCount'] },
		{ required: ['followingCount'] },
		{ required: ['notesCount'] },
	],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
        @Inject(DI.usersRepository)
        private usersRepository: UsersRepository,

        private globalEventService: GlobalEventService,
        private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// ロールポリシーチェック
			const policies = await this.roleService.getUserPolicies(me.id);
			if (!policies.canUpdateCounters) {
				throw new ApiError(meta.errors.youDontHavePermission);
			}

			const updates: Partial<{
                followersCount: number;
                followingCount: number;
                notesCount: number;
            }> = {};

			if (ps.followersCount !== undefined && ps.followersCount !== null) {
				updates.followersCount = ps.followersCount;
			}
			if (ps.followingCount !== undefined && ps.followingCount !== null) {
				updates.followingCount = ps.followingCount;
			}
			if (ps.notesCount !== undefined && ps.notesCount !== null) {
				updates.notesCount = ps.notesCount;
			}

			if (Object.keys(updates).length === 0) {
				throw new ApiError(meta.errors.invalidValue);
			}

			await this.usersRepository.update(me.id, updates);
			this.globalEventService.publishInternalEvent('localUserUpdated', { id: me.id });

			return await this.usersRepository.findOneByOrFail({ id: me.id });
		});
	}
}
