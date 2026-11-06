/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Not, IsNull } from 'typeorm';
import { MiUser } from '@/models/_.js';
import type { FollowingsRepository, MiMeta, UsersRepository } from '@/models/_.js';
import { QueueService } from '@/core/QueueService.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { SubAccountService } from '@/core/SubAccountService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';

@Injectable()
export class DeleteAccountService {
	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private userEntityService: UserEntityService,
		private apRendererService: ApRendererService,
		private queueService: QueueService,
		private globalEventService: GlobalEventService,
		private moderationLogService: ModerationLogService,
		private systemAccountService: SystemAccountService,
		private subAccountService: SubAccountService,
	) {
	}

	@bindThis
	public async deleteAccount(user: {
		id: string;
		host: string | null;
	}, moderator?: MiUser, opts: { viaParent?: boolean } = {}): Promise<void> {
		if (this.meta.rootUserId === user.id) throw new Error('cannot delete a root account');

		const _user = await this.usersRepository.findOneByOrFail({ id: user.id });

		// A main account takes its sub-accounts with it. The main account is marked first (blocks new sub-accounts),
		// then every sub-account is revoked and marked; the main account's delete job removes the sub-accounts
		// before its own row (the FK is ON DELETE RESTRICT).
		if (_user.parentUserId == null && opts.viaParent !== true) {
			// Mark the main account under the same per-parent lock sub-account creation takes, even with zero sub-accounts,
			// so a creation racing with this deletion either finishes before the list below or is refused.
			const subs = await this.usersRepository.manager.transaction(async em => {
				await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`subaccount:parent:${_user.id}`]);
				const found = await em.findBy(MiUser, { parentUserId: _user.id });
				if (user.host === null && !_user.username.includes('.')) await em.update(MiUser, { id: _user.id }, { isDeleted: true });
				return found;
			});
			if (subs.length > 0) {
				this.globalEventService.publishInternalEvent('userChangeDeletedState', { id: _user.id, isDeleted: true });
				await this.subAccountService.invalidateSubAccountTokens(_user.id);
				for (const sub of subs) {
					await this.deleteAccount({ id: sub.id, host: sub.host }, moderator, { viaParent: true });
				}
			}
		}

		if (user.host === null && _user.username.includes('.')) {
			throw new Error('cannot delete a system account');
		}

		if (moderator != null) {
			this.moderationLogService.log(moderator, 'deleteAccount', {
				userId: user.id,
				userUsername: _user.username,
				userHost: user.host,
			});
		}

		// 物理削除する前にDelete activityを送信する
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

			if (opts.viaParent !== true) {
				this.queueService.createDeleteAccountJob(user, {
					soft: false,
				});
			}
		} else {
			// リモートユーザーの削除は、完全にDBから物理削除してしまうと再度連合してきてアカウントが復活する可能性があるため、soft指定する
			this.queueService.createDeleteAccountJob(user, {
				soft: true,
			});
		}

		await this.usersRepository.update(user.id, {
			isDeleted: true,
		});

		this.globalEventService.publishInternalEvent('userChangeDeletedState', { id: user.id, isDeleted: true });
	}
}
