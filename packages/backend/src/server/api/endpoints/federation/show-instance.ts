/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { InstancesRepository } from '@/models/_.js';
import { InstanceEntityService } from '@/core/entities/InstanceEntityService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';

export const meta = {
	tags: ['federation'],

	requireCredential: false,

	res: {
		type: 'object',
		optional: false, nullable: true,
		ref: 'FederationInstance',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		host: { type: 'string' },
	},
	required: ['host'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		private utilityService: UtilityService,
		private instanceEntityService: InstanceEntityService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const instance = await this.instancesRepository
				.findOneBy({ host: this.utilityService.toPuny(ps.host) });
			const isRoot = await this.roleService.isAdministrator(me);

			if (!me) {
				return null;
			}

			if (instance) {
				const data = await this.instanceEntityService.pack(instance, me);
				if (!me || !isRoot) {
					return {
						...data,
						isBlocked: false,
						isMediaSilenced: false,
						isQuarantineLimited: false,
						isSilenced: false,
						isSuspended: false,
					};
				}
				return data;
			}
			return null;
		});
	}
}
