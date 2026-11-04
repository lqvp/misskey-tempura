/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, Scope } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { AntennasRepository } from '@/models/_.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { NoteStreamingHidingService } from '../NoteStreamingHidingService.js';
import { bindThis } from '@/decorators.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import type { JsonObject } from '@/misc/json-value.js';
import Channel, { type ChannelRequest } from '../channel.js';
import { REQUEST } from '@nestjs/core';

@Injectable({ scope: Scope.TRANSIENT })
export class AntennaChannel extends Channel {
	public readonly chName = 'antenna';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:account';
	private antennaId: string;
	private deliverableNoteIds = new Set<string>();

	constructor(
		@Inject(REQUEST)
		request: ChannelRequest,

		@Inject(DI.antennasRepository)
		private antennasReposiotry: AntennasRepository,

		private noteEntityService: NoteEntityService,
		private noteStreamingHidingService: NoteStreamingHidingService,
	) {
		super(request);
		//this.onEvent = this.onEvent.bind(this);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (typeof params.antennaId !== 'string') return false;
		if (!this.user) return false;

		this.antennaId = params.antennaId;

		const antennaExists = await this.antennasReposiotry.exists({
			where: {
				id: this.antennaId,
				userId: this.user.id,
			},
		});

		if (!antennaExists) return false;

		// Subscribe stream
		this.subscriber.on(`antennaStream:${this.antennaId}`, this.onEvent);

		return true;
	}

	@bindThis
	private async onEvent(data: GlobalEvents['antenna']['payload']) {
		if (data.type === 'note') {
			let note = data.body;

			if (!this.isNoteVisibleForMe(note)) return;
			if (this.isNoteMutedOrBlocked(note)) return;

			const filtered = await this.noteStreamingHidingService.filter(note, this.user?.id ?? null);
			if (!filtered) return;
			note = filtered;

			// noteMatchedと同じフィルタを通すため、送信したノートを記録しておく
			this.deliverableNoteIds.add(note.id);
			if (this.deliverableNoteIds.size > 200) {
				const oldest = this.deliverableNoteIds.values().next().value!;
				this.deliverableNoteIds.delete(oldest);
			}

			this.send('note', await this.noteEntityService.withMyRenoteReaction(note, this.user?.id ?? null));
		} else if (data.type === 'noteMatched') {
			// チャンネルミュート等でnoteが送信されなかったノートのマッチ情報は漏らさない
			// (noteMatchedは対応するnoteの直後に配信される)
			if (this.deliverableNoteIds.delete(data.body.noteId)) {
				this.send('noteMatched', data.body);
			}
		}
	}

	@bindThis
	public dispose() {
		// Unsubscribe events
		this.subscriber.off(`antennaStream:${this.antennaId}`, this.onEvent);
	}
}
