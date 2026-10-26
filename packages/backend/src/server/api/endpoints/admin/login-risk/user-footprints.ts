/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { SigninsRepository, UsersRepository } from '@/models/_.js';
import { QueryService } from '@/core/QueryService.js';
import { RoleService } from '@/core/RoleService.js';
import { SigninEntityService } from '@/core/entities/SigninEntityService.js';
import { LoginRiskService } from '@/core/LoginRiskService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../../error.js';
import { familyGuard } from '@/server/api/family-guard.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:show-user',

	description: 'Lists sign-in attempts of a user that the login risk detection judged suspicious.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Signin',
		},
	},

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '4007570c-f127-4f45-b789-f85aeae8d5f6',
		},

		cannotShowAdministrator: {
			message: 'Only administrators can see the sign-in attempts of an administrator.',
			code: 'CANNOT_SHOW_ADMINISTRATOR',
			id: '6ec4524f-779e-46ae-bf67-4828c16b46bb',
		},
	},

	familyGuard: familyGuard.notApplicable('read-only'),
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.signinsRepository)
		private signinsRepository: SigninsRepository,

		private signinEntityService: SigninEntityService,
		private queryService: QueryService,
		private roleService: RoleService,
		private loginRiskService: LoginRiskService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await this.usersRepository.findOneBy({ id: ps.userId });
			if (user == null) {
				throw new ApiError(meta.errors.noSuchUser);
			}

			// admin/show-user と同じく、管理者の情報は管理者にだけ見せる
			if (await this.roleService.isAdministrator(user) && !await this.roleService.isAdministrator(me)) {
				throw new ApiError(meta.errors.cannotShowAdministrator);
			}

			const query = this.queryService.makePaginationQuery(this.signinsRepository.createQueryBuilder('signin'), ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
				.andWhere('signin.userId = :userId', { userId: user.id });
			this.loginRiskService.filterSuspiciousSignins(query, 'signin');

			const history = await query.limit(ps.limit).getMany();

			return await Promise.all(history.map(record => this.signinEntityService.pack(record)));
		});
	}
}
