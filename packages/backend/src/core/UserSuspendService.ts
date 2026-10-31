/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Not, IsNull } from 'typeorm';
import type { FollowingsRepository, FollowRequestsRepository, UsersRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { QueueService } from '@/core/QueueService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DI } from '@/di-symbols.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';
import { RelationshipJobData } from '@/queue/types.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';

@Injectable()
export class UserSuspendService {
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		@Inject(DI.followRequestsRepository)
		private followRequestsRepository: FollowRequestsRepository,

		private userEntityService: UserEntityService,
		private queueService: QueueService,
		private globalEventService: GlobalEventService,
		private apRendererService: ApRendererService,
		private moderationLogService: ModerationLogService,
	) {
	}

	/**
	 * Suspend by moderation. For a main account this also suspends its sub-accounts (suspendedByParent).
	 * isSuspended is the effective value: suspendedSelf OR suspendedByParent.
	 */
	@bindThis
	public async suspend(user: MiUser, moderator: MiUser): Promise<void> {
		await this.usersRepository.update(user.id, {
			isSuspended: true,
			suspendedSelf: true,
		});

		this.moderationLogService.log(moderator, 'suspend', {
			userId: user.id,
			userUsername: user.username,
			userHost: user.host,
		});

		(async () => {
			await this.postSuspend(user).catch(_ => {});
			await this.unFollowAll(user).catch(_ => {});
		})();

		await this.suspendSubAccounts(user);
	}

	@bindThis
	public async unsuspend(user: MiUser, moderator: MiUser): Promise<void> {
		const current = await this.usersRepository.findOneBy({ id: user.id });
		const stillSuspended = current?.suspendedByParent === true;
		await this.usersRepository.update(user.id, {
			suspendedSelf: false,
			isSuspended: stillSuspended,
		});

		this.moderationLogService.log(moderator, 'unsuspend', {
			userId: user.id,
			userUsername: user.username,
			userHost: user.host,
		});

		if (!stillSuspended) {
			(async () => {
				await this.postUnsuspend(user).catch(_ => {});
			})();
		}

		await this.unsuspendSubAccounts(user);
	}

	@bindThis
	private async suspendSubAccounts(parent: MiUser): Promise<void> {
		if (parent.parentUserId != null) return;
		const subs = await this.usersRepository.findBy({ parentUserId: parent.id });
		for (const sub of subs) {
			const wasSuspended = sub.isSuspended;
			await this.usersRepository.update(sub.id, { suspendedByParent: true, isSuspended: true });
			// Always publish the effective state so the sub's Streaming sessions and auth caches drop at once
			this.globalEventService.publishInternalEvent('userChangeSuspendedState', { id: sub.id, isSuspended: true });
			if (!wasSuspended) {
				(async () => {
					await this.postSuspend(sub).catch(_ => {});
					await this.unFollowAll(sub).catch(_ => {});
				})();
			}
		}
	}

	/** Clears only the parent-caused suspension; subs suspended on their own stay suspended. */
	@bindThis
	private async unsuspendSubAccounts(parent: MiUser): Promise<void> {
		if (parent.parentUserId != null) return;
		const current = await this.usersRepository.findOneBy({ id: parent.id });
		if (current?.isSuspended) return; // parent still suspended
		const subs = await this.usersRepository.findBy({ parentUserId: parent.id, suspendedByParent: true });
		for (const sub of subs) {
			await this.usersRepository.update(sub.id, { suspendedByParent: false, isSuspended: sub.suspendedSelf });
			this.globalEventService.publishInternalEvent('userChangeSuspendedState', { id: sub.id, isSuspended: sub.suspendedSelf });
			if (!sub.suspendedSelf) {
				(async () => {
					await this.postUnsuspend(sub).catch(_ => {});
				})();
			}
		}
	}

	@bindThis
	private async postSuspend(user: { id: MiUser['id']; host: MiUser['host'] }): Promise<void> {
		this.globalEventService.publishInternalEvent('userChangeSuspendedState', { id: user.id, isSuspended: true });

		this.followRequestsRepository.delete({
			followeeId: user.id,
		});
		this.followRequestsRepository.delete({
			followerId: user.id,
		});

		if (this.userEntityService.isLocalUser(user)) {
			// 知り得る全SharedInboxにDelete配信
			const content = this.apRendererService.addContext(this.apRendererService.renderDelete(this.userEntityService.genLocalUserUri(user.id), user));

			const queue: string[] = [];

			const inboxes = await this.usersRepository.query('SELECT DISTINCT "sharedInbox" from "user" AS U INNER JOIN instance AS I ON U.host = I.host WHERE (I."followersCount" > 0 OR I."followingCount" > 0)');

			for (const inbox of inboxes) {
				if (inbox.sharedInbox != null) queue.push(inbox.sharedInbox);
			}

			for (const inbox of queue) {
				this.queueService.deliver(user, content, inbox, true);
			}
		}
	}

	@bindThis
	private async postUnsuspend(user: MiUser): Promise<void> {
		this.globalEventService.publishInternalEvent('userChangeSuspendedState', { id: user.id, isSuspended: false });

		if (this.userEntityService.isLocalUser(user)) {
			// 知り得る全SharedInboxにUndo Delete配信
			const content = this.apRendererService.addContext(this.apRendererService.renderUndo(this.apRendererService.renderDelete(this.userEntityService.genLocalUserUri(user.id), user), user));

			const queue: string[] = [];

			const inboxes = await this.usersRepository.query('SELECT DISTINCT "sharedInbox" from "user" AS U INNER JOIN instance AS I ON U.host = I.host WHERE (I."followersCount" > 0 OR I."followingCount" > 0)');

			for (const inbox of inboxes) {
				if (inbox.sharedInbox != null) queue.push(inbox.sharedInbox);
			}

			for (const inbox of queue) {
				this.queueService.deliver(user as any, content, inbox, true);
			}
		}
	}

	@bindThis
	private async unFollowAll(follower: MiUser) {
		const followings = await this.followingsRepository.find({
			where: {
				followerId: follower.id,
				followeeId: Not(IsNull()),
			},
		});

		const jobs: RelationshipJobData[] = [];
		for (const following of followings) {
			if (following.followeeId && following.followerId) {
				jobs.push({
					from: { id: following.followerId },
					to: { id: following.followeeId },
					silent: true,
				});
			}
		}
		this.queueService.createUnfollowJob(jobs);
	}
}
