/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { MiUser } from '@/models/User.js';
import type { RolesRepository, RoleAssignmentsRepository, UsersRepository, NotesRepository, DriveFilesRepository, FlashsRepository, GalleryPostsRepository, ChannelsRepository, RegistrationTicketsRepository } from '@/models/_.js';
import { ApiError } from '@/server/api/error.js';
import { UPDATE_META_SUB_ALLOWED_KEYS } from '@/server/api/family-guard.js';
import type { FamilyGuard, FamilyTargetSpec } from '@/server/api/family-guard.js';

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

const subAllowedMetaKeys: ReadonlySet<string> = new Set(UPDATE_META_SUB_ALLOWED_KEYS);

@Injectable()
export class FamilyGuardService {
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.rolesRepository)
		private rolesRepository: RolesRepository,

		@Inject(DI.roleAssignmentsRepository)
		private roleAssignmentsRepository: RoleAssignmentsRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.flashsRepository)
		private flashsRepository: FlashsRepository,

		@Inject(DI.galleryPostsRepository)
		private galleryPostsRepository: GalleryPostsRepository,

		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,

		@Inject(DI.registrationTicketsRepository)
		private registrationTicketsRepository: RegistrationTicketsRepository,
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
	public async assertAllowed(endpointName: string, guard: FamilyGuard | undefined, actor: Actor | null | undefined, data: Record<string, unknown>): Promise<void> {
		if (actor == null || actor.parentUserId == null || guard == null) return;

		switch (guard.kind) {
			case 'notApplicable':
				return;
			case 'subDenied':
				throw new ApiError(subDenied);
			case 'targets': {
				const ids: string[] = [];
				for (const spec of guard.targets) {
					const v = data[spec.param];
					const values: string[] = spec.array
						? (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
						: (typeof v === 'string' ? [v] : []);
					for (const value of values) {
						if (spec.resolve == null) {
							ids.push(value);
						} else {
							const owner = await this.resolveOwner(spec.resolve, value);
							if (owner != null) ids.push(owner); // unknown resources fall through to the normal error
						}
					}
				}
				for (const spec of guard.targets) {
					if (spec.denySelf && !spec.array && data[spec.param] === actor.id) throw new ApiError(subDenied);
				}
				for (const id of new Set(ids)) {
					if (await this.isFamily(actor, id)) throw new ApiError(familyDenied);
				}
				return;
			}
			case 'rule':
				if (guard.rule === 'role-definition') return await this.assertRoleDefinition(endpointName, actor, data);
				return this.assertServerSettings(data);
		}
	}

	@bindThis
	private async resolveOwner(kind: NonNullable<FamilyTargetSpec['resolve']>, id: string): Promise<string | null> {
		const opts = { where: { id }, select: { id: true, userId: true } } as const;
		switch (kind) {
			case 'note': return (await this.notesRepository.findOne(opts))?.userId ?? null;
			case 'file': return (await this.driveFilesRepository.findOne(opts))?.userId ?? null;
			case 'flash': return (await this.flashsRepository.findOne(opts))?.userId ?? null;
			case 'galleryPost': return (await this.galleryPostsRepository.findOne(opts))?.userId ?? null;
			case 'channel': return (await this.channelsRepository.findOne(opts))?.userId ?? null;
			case 'invite': return (await this.registrationTicketsRepository.findOne({ where: { id }, select: { id: true, createdById: true } }))?.createdById ?? null;
		}
	}

	@bindThis
	private assertServerSettings(data: Record<string, unknown>): void {
		for (const [k, v] of Object.entries(data)) {
			if (v === undefined) continue;
			// the auth token is carried in the body as `i` by some clients; it is not a setting
			if (k === 'i') continue;
			// unclassified keys are refused by default
			if (!subAllowedMetaKeys.has(k)) throw new ApiError(subDenied);
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
