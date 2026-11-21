/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { MiUser } from '@/models/User.js';
import type { RolesRepository, RoleAssignmentsRepository, UsersRepository } from '@/models/_.js';
import { ApiError } from '@/server/api/error.js';
import { UPDATE_META_SUB_DENIED_KEYS } from '@/server/api/family-guard.js';
import type { FamilyRule, FamilyTargetSpec } from '@/server/api/family-guard.js';

const familyDenied = {
	message: 'A sub-account cannot do this to its parent or sibling accounts.',
	code: 'DENIED_FOR_SUB_ACCOUNT_FAMILY',
	id: 'bd517bdd-7f8b-46f5-9473-872cb306c36d',
	kind: 'permission',
	httpStatusCode: 403,
} as const;

const subDenied = {
	message: 'A sub-account cannot use this operation.',
	code: 'DENIED_FOR_SUB_ACCOUNT',
	id: 'b3b3a733-d5be-4894-83c6-cfff5fed0720',
	kind: 'permission',
	httpStatusCode: 403,
} as const;

type Actor = Pick<MiUser, 'id' | 'parentUserId'>;

const subDeniedMetaKeys: ReadonlySet<string> = new Set(UPDATE_META_SUB_DENIED_KEYS);

type FamilyMeta = {
	readonly denyForSubAccount?: boolean;
	readonly protectFamily?: readonly FamilyTargetSpec[];
	readonly protectFamilyRule?: FamilyRule;
};

@Injectable()
export class FamilyGuardService {
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.rolesRepository)
		private rolesRepository: RolesRepository,

		@Inject(DI.roleAssignmentsRepository)
		private roleAssignmentsRepository: RoleAssignmentsRepository,

	) {
	}

	/** Whether targetUserId is the parent or a sibling of the sub-account actor (decided by parentUserId only). */
	@bindThis
	public async isFamily(actor: Actor, targetUserId: string): Promise<boolean> {
		if (actor.parentUserId == null) return false;
		if (targetUserId === actor.id) return false;
		if (targetUserId === actor.parentUserId) return true;
		const target = await this.usersRepository.findOne({ where: { id: targetUserId }, select: { id: true, parentUserId: true } });
		return target != null && target.parentUserId === actor.parentUserId;
	}

	/**
	 * Run after authentication. Does nothing for normal accounts.
	 * Throws ApiError when a sub-account actor would operate on its family or on a protected setting.
	 */
	@bindThis
	public async assertAllowed(endpointName: string, meta: FamilyMeta, actor: Actor | null | undefined, data: Record<string, unknown>): Promise<void> {
		if (actor == null || actor.parentUserId == null) return;

		if (meta.denyForSubAccount) throw new ApiError(subDenied);

		if (meta.protectFamily != null) {
			const ids: string[] = [];
			for (const spec of meta.protectFamily) {
				const v = data[spec.param];
				const values: string[] = spec.array
					? (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
					: (typeof v === 'string' ? [v] : []);
				ids.push(...values);
			}
			for (const spec of meta.protectFamily) {
				if (spec.denySelf && !spec.array && data[spec.param] === actor.id) throw new ApiError(subDenied);
			}
			for (const id of new Set(ids)) {
				if (await this.isFamily(actor, id)) throw new ApiError(familyDenied);
			}
		}

		if (meta.protectFamilyRule === 'role-definition') await this.assertRoleDefinition(endpointName, actor, data);
		else if (meta.protectFamilyRule === 'server-settings') this.assertServerSettings(data);
	}

	@bindThis
	private assertServerSettings(data: Record<string, unknown>): void {
		for (const [k, v] of Object.entries(data)) {
			if (v === undefined) continue;
			// the auth token is carried in the body as `i` by some clients; it is not a setting
			if (k === 'i') continue;
			// only sign-in, registration and access settings are refused
			if (subDeniedMetaKeys.has(k)) throw new ApiError(subDenied);
		}
	}

	@bindThis
	private async assertRoleDefinition(endpointName: string, actor: Actor, data: Record<string, unknown>): Promise<void> {
		switch (endpointName) {
			case 'admin/roles/create':
				if (data.target !== 'manual' || data.isPublic !== false) throw new ApiError(subDenied);
				return;
			case 'admin/roles/update':
			case 'admin/roles/delete': {
				if (typeof data.roleId !== 'string') return;
				const role = await this.rolesRepository.findOneBy({ id: data.roleId });
				if (role == null) return; // normal "no such role" error
				if (role.target !== 'manual' || role.isPublic) throw new ApiError(subDenied);
				if (endpointName === 'admin/roles/update') {
					if (data.target !== undefined && data.target !== 'manual') throw new ApiError(subDenied);
					if (data.isPublic !== undefined && data.isPublic !== false) throw new ApiError(subDenied);
				}
				const holders = await this.roleAssignmentsRepository.find({ where: { roleId: role.id }, select: { userId: true } });
				const holderIds = holders.map(h => h.userId);
				if (holderIds.includes(actor.parentUserId!)) throw new ApiError(familyDenied);
				if (holderIds.length > 0) {
					const siblings = await this.usersRepository.count({ where: { id: In(holderIds), parentUserId: actor.parentUserId! } });
					const selfHolds = holderIds.includes(actor.id) ? 1 : 0;
					if (siblings - selfHolds > 0) throw new ApiError(familyDenied);
				}
				return;
			}
			default:
				// update-default-policies and any other role-definition endpoint affects everyone
				throw new ApiError(subDenied);
		}
	}
}
