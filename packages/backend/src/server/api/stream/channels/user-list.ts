/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, Scope } from '@nestjs/common';
import type { MiUserListMembership, UserListMembershipsRepository, UserListsRepository } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { NoteStreamingHidingService } from '../NoteStreamingHidingService.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { isRenotePacked, isQuotePacked } from '@/misc/is-renote.js';
import type { JsonObject } from '@/misc/json-value.js';
import Channel, { type ChannelRequest } from '../channel.js';
import { REQUEST } from '@nestjs/core';

const MAX_FETCH_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 1000;

@Injectable({ scope: Scope.TRANSIENT })
export class UserListChannel extends Channel {
	public readonly chName = 'userList';
	public static shouldShare = false;
	public static requireCredential = false as const;
	private listId: string;
	private membershipsMap: Record<string, Pick<MiUserListMembership, 'withReplies'> | undefined> = {};
	private listUsersFetchCount = 0;
	private isListDeleted = false;
	private isDisposed = false;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private withFiles: boolean;
	private withRenotes: boolean;

	constructor(
		@Inject(DI.userListsRepository)
		private userListsRepository: UserListsRepository,

		@Inject(DI.userListMembershipsRepository)
		private userListMembershipsRepository: UserListMembershipsRepository,

		@Inject(REQUEST)
		request: ChannelRequest,

		private noteEntityService: NoteEntityService,
		private noteStreamingHidingService: NoteStreamingHidingService,
	) {
		super(request);
		//this.updateListUsers = this.updateListUsers.bind(this);
		//this.onNote = this.onNote.bind(this);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (typeof params.listId !== 'string') return false;
		this.listId = params.listId;
		this.withFiles = !!(params.withFiles ?? false);
		this.withRenotes = !!(params.withRenotes ?? true);

		// Check existence and owner
		const listExist = await this.userListsRepository.exists({
			where: {
				id: this.listId,
				userId: this.user!.id,
			},
		});
		if (!listExist || this.isInactive()) return false;

		// Subscribe stream
		this.subscriber.on(`userListStream:${this.listId}`, this.onListEvent);

		this.subscriber.on('notesStream', this.onNote);

		// 初回。以降はイベントを受けたときだけ読み直す
		void this.updateListUsers();

		return true;
	}

	private isInactive(): boolean {
		return this.isListDeleted || this.isDisposed;
	}

	private clearRetryTimer(): void {
		if (this.retryTimer != null) {
			clearTimeout(this.retryTimer);
			this.retryTimer = null;
		}
	}

	@bindThis
	private onListEvent(data: GlobalEvents['userList']['payload']) {
		if (data.type === 'internalListDeleted') {
			// リストが削除されたら、以降のノートを配信しない
			this.isListDeleted = true;
			this.listUsersFetchCount++;
			this.clearRetryTimer();
			this.membershipsMap = {};
			return;
		}

		// 所属の読み直しは、メンバーシップの変更時に必ず発行される internalMembershipUpdated だけをきっかけにする
		if (data.type === 'internalMembershipUpdated') {
			void this.updateListUsers();
			return;
		}

		// クライアントに転送するのはメンバーの追加・削除のみ
		if (data.type === 'userAdded' || data.type === 'userRemoved') {
			this.send(data);
		}
	}

	@bindThis
	private async updateListUsers(retryAttempt = 0) {
		if (this.isInactive()) return;
		this.clearRetryTimer();

		const fetchCount = ++this.listUsersFetchCount;

		let memberships: Pick<MiUserListMembership, 'userId' | 'withReplies'>[];
		try {
			memberships = await this.userListMembershipsRepository.find({
				where: {
					userListId: this.listId,
				},
				select: { userId: true, withReplies: true },
			});
		} catch {
			// 一時的な DB エラーでメンバー表が欠落・古いまま固着しないよう、上限付きの指数バックオフで再試行する
			if (
				!this.isInactive() &&
				fetchCount === this.listUsersFetchCount &&
				retryAttempt < MAX_FETCH_RETRIES
			) {
				const delay = Math.round(RETRY_BASE_DELAY_MS * (2 ** retryAttempt) * (0.8 + Math.random() * 0.4));
				this.retryTimer = setTimeout(() => {
					this.retryTimer = null;
					void this.updateListUsers(retryAttempt + 1);
				}, delay);
				this.retryTimer.unref();
			}
			return;
		}

		// 読み込み中に削除・破棄または次の読み込みが始まっていれば古い結果は使わない
		if (this.isInactive() || fetchCount !== this.listUsersFetchCount) return;

		const membershipsMap: Record<string, Pick<MiUserListMembership, 'withReplies'> | undefined> = {};
		for (const membership of memberships) {
			membershipsMap[membership.userId] = {
				withReplies: membership.withReplies,
			};
		}
		this.membershipsMap = membershipsMap;
	}

	@bindThis
	private async onNote(note: Packed<'Note'>) {
		const isMe = this.user!.id === note.userId;

		// チャンネル投稿は無視する
		if (note.channelId) return;

		if (this.withFiles && (note.fileIds == null || note.fileIds.length === 0)) return;

		if (!Object.hasOwn(this.membershipsMap, note.userId)) return;

		if (!this.isNoteVisibleForMe(note)) return;

		if (note.reply) {
			const reply = note.reply;
			// 「チャンネル接続主への返信」「チャンネル接続主が行った返信」「投稿者の投稿者自身への返信」は、設定にかかわらず対象
			if (reply.userId !== this.user!.id && !isMe && reply.userId !== note.userId) {
				// それ以外の返信は「返信を含める」が有効なメンバーのものだけを対象とし、自分が見られない投稿への返信は弾く
				if (!this.membershipsMap[note.userId]?.withReplies) return;
				if (!this.isNoteVisibleForMe(reply)) return;
			}
		}

		if (isRenotePacked(note) && !isQuotePacked(note) && !this.withRenotes) return;

		if (this.isNoteMutedOrBlocked(note)) return;

		const filtered = await this.noteStreamingHidingService.filter(note, this.user?.id ?? null);
		if (!filtered) return;
		// eslint-disable-next-line no-param-reassign -- これ以降元の Note オブジェクトは見てはいけないので、いっそ再代入した方が安全
		note = filtered;

		const packed = await this.noteEntityService.withMyRenoteReaction(note, this.user?.id ?? null);

		// 処理中にリストが削除・破棄されていれば送らない
		if (this.isInactive()) return;

		this.send('note', packed);
	}

	@bindThis
	public dispose() {
		this.isDisposed = true;
		this.listUsersFetchCount++;
		this.clearRetryTimer();

		// Unsubscribe events
		this.subscriber.off(`userListStream:${this.listId}`, this.onListEvent);
		this.subscriber.off('notesStream', this.onNote);
	}
}
