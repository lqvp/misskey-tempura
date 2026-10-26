/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { generateNativeUserToken } from '@/misc/token.js';
import type { AccessTokensRepository, AntennasRepository, ChannelsRepository, ClipsRepository, DriveFoldersRepository, UserListsRepository, UsersRepository, MiMeta } from '@/models/_.js';
import { MiUser } from '@/models/User.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { RoleService } from '@/core/RoleService.js';
import { SignupService } from '@/core/SignupService.js';
import { RegistryApiService } from '@/core/RegistryApiService.js';
import { SubAccountError } from '@/server/api/sub-account-errors.js';

export type ProbeReference = {
	type: 'list' | 'antenna' | 'channel' | 'clip' | 'driveFolder';
	id: string;
};

export type InitialSettingItem = {
	scope: string[];
	key: string;
	value: unknown;
};

// Registry areas the client may write at creation, and the keys inside them that must never be copied
// (credentials, other accounts, notes, plugins). The client filters first; this is the server-side backstop.
const INITIAL_SETTINGS_SCOPES = [['client', 'base'], ['client', 'preferences', 'sync']] as const;
const INITIAL_SETTINGS_NEVER_KEYS = ['accountTokens', 'accountInfos', 'pluginTokens', 'geminiToken', 'memo', 'accounts', 'plugins'] as const;
const INITIAL_SETTINGS_MAX_ITEMS = 400;
const INITIAL_SETTINGS_MAX_BYTES = 512 * 1024;

export type SubAccountCreationStatus = {
	canCreate: boolean;
	reason: 'NOT_ALLOWED' | 'LIMIT_REACHED' | 'REGISTRATION_CLOSED' | 'NOT_READY' | 'PARENT_INVALID' | null;
	limit: number;
	used: number;
	remaining: number;
	requiresApproval: boolean;
	mode: MiMeta['subAccountCreationMode'];
};

@Injectable()
export class SubAccountService {
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.accessTokensRepository)
		private accessTokensRepository: AccessTokensRepository,

		@Inject(DI.userListsRepository)
		private userListsRepository: UserListsRepository,

		@Inject(DI.antennasRepository)
		private antennasRepository: AntennasRepository,

		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,

		@Inject(DI.clipsRepository)
		private clipsRepository: ClipsRepository,

		@Inject(DI.driveFoldersRepository)
		private driveFoldersRepository: DriveFoldersRepository,

		@Inject(DI.meta)
		private meta: MiMeta,

		private registryApiService: RegistryApiService,

		private globalEventService: GlobalEventService,
		private roleService: RoleService,
		private signupService: SignupService,
	) {
	}

	/** What the server would do if `parent` created a sub-account now. The server re-evaluates this at creation. */
	@bindThis
	public async getCreationStatus(parent: Pick<MiUser, 'id' | 'parentUserId' | 'host'>): Promise<SubAccountCreationStatus> {
		const policies = await this.roleService.getUserPolicies(parent.id);
		const used = await this.usersRepository.countBy({ parentUserId: parent.id });
		const limit = policies.subAccountLimit;
		const mode = this.meta.subAccountCreationMode;
		const requiresApproval = mode === 'followRegistration' && this.meta.approvalRequiredForSignup;

		let reason: SubAccountCreationStatus['reason'] = null;
		if (parent.parentUserId != null || parent.host != null) reason = 'PARENT_INVALID';
		else if (this.meta.rootUserId == null) reason = 'NOT_READY'; // signup would make the new account the root
		else if (!policies.canCreateSubAccount) reason = 'NOT_ALLOWED';
		else if (used >= limit) reason = 'LIMIT_REACHED';
		else if (mode === 'followRegistration' && this.meta.disableRegistration) reason = 'REGISTRATION_CLOSED';

		return { canCreate: reason == null, reason, limit, used, remaining: Math.max(0, limit - used), requiresApproval, mode };
	}

	/** Create a sub-account. When approval would be needed, `confirmPending` must be true. */
	@bindThis
	public async create(parent: Pick<MiUser, 'id' | 'parentUserId' | 'host'>, username: string, confirmPending: boolean): Promise<{ account: MiUser; requiresApproval: boolean }> {
		const status = await this.getCreationStatus(parent);
		if (!status.canCreate) throw new SubAccountError(status.reason!);
		if (status.requiresApproval && !confirmPending) throw new SubAccountError('CONFIRMATION_REQUIRED');

		try {
			const { account } = await this.signupService.signup({
				username,
				approved: !status.requiresApproval,
				subAccount: { parentId: parent.id, limit: status.limit },
			});
			return { account, requiresApproval: !account.approved };
		} catch (e) {
			const m = e instanceof Error ? e.message : '';
			if (m === 'INVALID_USERNAME') throw new SubAccountError('INVALID_USERNAME');
			if (m === 'DUPLICATED_USERNAME' || m === 'USED_USERNAME' || m.includes('already used')) throw new SubAccountError('USERNAME_USED');
			if (m === 'SUB_ACCOUNT_LIMIT') throw new SubAccountError('LIMIT_REACHED');
			if (m === 'SUB_ACCOUNT_PARENT_INVALID') throw new SubAccountError('PARENT_INVALID');
			throw e;
		}
	}

	@bindThis
	public async list(parent: Pick<MiUser, 'id'>): Promise<MiUser[]> {
		return await this.usersRepository.find({ where: { parentUserId: parent.id, isDeleted: false }, order: { id: 'ASC' } });
	}

	@bindThis
	public async getOwned(parent: Pick<MiUser, 'id'>, subId: MiUser['id']): Promise<MiUser> {
		const sub = await this.usersRepository.findOneBy({ id: subId, parentUserId: parent.id, isDeleted: false });
		if (sub == null) throw new SubAccountError('NO_SUCH_SUB_ACCOUNT');
		return sub;
	}

	/**
	 * Which of the given references could the sub-account itself use?
	 * Evaluated with the sub-account's user id, never the main account's, using the same visibility rules as the
	 * corresponding show endpoints (own or public lists and clips, own antennas and drive folders, existing channels).
	 * Returns the usable ids per reference; everything else must be emptied by the caller.
	 */
	@bindThis
	public async probeReferences(parent: Pick<MiUser, 'id'>, subId: MiUser['id'], references: ProbeReference[]): Promise<ProbeReference[]> {
		const sub = await this.getOwned(parent, subId);
		const usable: ProbeReference[] = [];
		for (const ref of references) {
			let ok = false;
			switch (ref.type) {
				case 'list':
					ok = await this.userListsRepository.existsBy([{ id: ref.id, userId: sub.id }, { id: ref.id, isPublic: true }]);
					break;
				case 'antenna':
					ok = await this.antennasRepository.existsBy({ id: ref.id, userId: sub.id });
					break;
				case 'channel':
					ok = await this.channelsRepository.existsBy({ id: ref.id });
					break;
				case 'clip':
					ok = await this.clipsRepository.existsBy([{ id: ref.id, userId: sub.id }, { id: ref.id, isPublic: true }]);
					break;
				case 'driveFolder':
					ok = await this.driveFoldersRepository.existsBy({ id: ref.id, userId: sub.id });
					break;
			}
			if (ok) usable.push(ref);
		}
		return usable;
	}

	/**
	 * Show or hide the parent/sub relation on public profiles. Both flags start hidden and are per sub-account.
	 * The main account changes them for any of its sub-accounts (`subId`); a sub-account changes its own.
	 */
	@bindThis
	public async updateDisplay(actor: Pick<MiUser, 'id' | 'parentUserId'>, subId: MiUser['id'] | undefined, flags: { showParentOnProfile?: boolean; showSubOnProfile?: boolean }): Promise<void> {
		let targetId: MiUser['id'];
		if (actor.parentUserId != null) {
			if (subId != null && subId !== actor.id) throw new SubAccountError('NO_SUCH_SUB_ACCOUNT');
			targetId = actor.id;
		} else {
			if (subId == null) throw new SubAccountError('NO_SUCH_SUB_ACCOUNT');
			targetId = (await this.getOwned(actor, subId)).id;
		}
		const set: { showParentOnProfile?: boolean; showSubOnProfile?: boolean } = {};
		if (typeof flags.showParentOnProfile === 'boolean') set.showParentOnProfile = flags.showParentOnProfile;
		if (typeof flags.showSubOnProfile === 'boolean') set.showSubOnProfile = flags.showSubOnProfile;
		if (Object.keys(set).length === 0) return;
		await this.usersRepository.update(targetId, set);
		this.globalEventService.publishInternalEvent('localUserUpdated', { id: targetId });
	}

	/**
	 * Save settings carried over from the main account into a sub-account, once, right after creation.
	 * The main account's authentication is used; the sub-account's token is not needed.
	 * The right to save is a window opened only when the sub-account is created (`initialSettingsOpenUntil`).
	 * It is closed by an atomic claim, so a second or concurrent call is refused, whatever else exists in the
	 * sub-account's registry. An empty list also closes it. If writing fails the window is reopened.
	 */
	@bindThis
	public async saveInitialSettings(parent: Pick<MiUser, 'id'>, subId: MiUser['id'], items: InitialSettingItem[]): Promise<number> {
		const sub = await this.getOwned(parent, subId);
		if (items.length > INITIAL_SETTINGS_MAX_ITEMS) throw new SubAccountError('INITIAL_SETTINGS_REJECTED');
		if (JSON.stringify(items).length > INITIAL_SETTINGS_MAX_BYTES) throw new SubAccountError('INITIAL_SETTINGS_REJECTED');
		for (const item of items) {
			const scopeOk = INITIAL_SETTINGS_SCOPES.some(sc => sc.length === item.scope.length && sc.every((v, i) => v === item.scope[i]));
			if (!scopeOk) throw new SubAccountError('INITIAL_SETTINGS_REJECTED');
			if ((INITIAL_SETTINGS_NEVER_KEYS as readonly string[]).includes(item.key)) throw new SubAccountError('INITIAL_SETTINGS_REJECTED');
		}

		const openUntil = sub.initialSettingsOpenUntil;
		if (openUntil == null || openUntil.getTime() <= Date.now()) throw new SubAccountError('INITIAL_SETTINGS_CLOSED');
		// The claim and every write share one transaction: a failure or a process stop rolls both back,
		// so the window stays open and nothing partial remains. Only one caller can move the window from open to closed.
		await this.registryApiService.setManyAtomically(sub.id, items, async em => {
			const claim = await em.createQueryBuilder()
				.update(MiUser)
				.set({ initialSettingsOpenUntil: null })
				.where('id = :id AND "parentUserId" = :parent AND "initialSettingsOpenUntil" > now()', { id: sub.id, parent: parent.id })
				.execute();
			if (!claim.affected) throw new SubAccountError('INITIAL_SETTINGS_CLOSED');
		});
		return items.length;
	}

	/** The native token of a usable sub-account (first switch on a device). Pending ones are refused; with approval off it is approved now. */
	@bindThis
	public async getSwitchToken(parent: Pick<MiUser, 'id'>, subId: MiUser['id']): Promise<string> {
		const sub = await this.getOwned(parent, subId);
		if (sub.isSuspended) throw new SubAccountError('SUB_ACCOUNT_SUSPENDED');
		if (!sub.approved) {
			if (this.meta.approvalRequiredForSignup) throw new SubAccountError('PENDING_APPROVAL');
			await this.usersRepository.update(sub.id, { approved: true });
		}
		if (sub.token == null) throw new SubAccountError('NO_SUCH_SUB_ACCOUNT');
		return sub.token;
	}

	/**
	 * Revoke every credential of the sub-accounts of a main account:
	 * regenerate each native token, delete their API keys (MiAccessToken) and disconnect their Streaming connections.
	 * Called when the main account regenerates its token or is deleted.
	 */
	@bindThis
	public async invalidateSubAccountTokens(parentId: MiUser['id']): Promise<MiUser['id'][]> {
		const subs = await this.usersRepository.findBy({ parentUserId: parentId });
		for (const sub of subs) {
			await this.regenerateToken(sub);
		}
		return subs.map(s => s.id);
	}

	/** Regenerate one sub-account's token and delete its API keys. */
	@bindThis
	public async regenerateToken(sub: Pick<MiUser, 'id' | 'token'>): Promise<string> {
		const oldToken = sub.token;
		const newToken = generateNativeUserToken();
		await this.usersRepository.update(sub.id, { token: newToken });
		await this.accessTokensRepository.delete({ userId: sub.id });
		if (oldToken != null) {
			this.globalEventService.publishInternalEvent('userTokenRegenerated', { id: sub.id, oldToken, newToken });
		}
		this.globalEventService.publishMainStream(sub.id, 'myTokenRegenerated');
		this.globalEventService.publishInternalEvent('subAccountSessionsRevoked', { subIds: [sub.id] });
		return newToken;
	}
}
