/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In, IsNull, Not } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { NotesRepository, UsersRepository, PollsRepository, PollVotesRepository, MiUser } from '@/models/_.js';
import type { MiRemoteUser } from '@/models/User.js';
import type { MiNote } from '@/models/Note.js';
import { RelayService } from '@/core/RelayService.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { bindThis } from '@/decorators.js';
import { UserBlockingService } from '@/core/UserBlockingService.js';

@Injectable()
export class PollService {
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.pollsRepository)
		private pollsRepository: PollsRepository,

		@Inject(DI.pollVotesRepository)
		private pollVotesRepository: PollVotesRepository,

		private userEntityService: UserEntityService,
		private idService: IdService,
		private relayService: RelayService,
		private globalEventService: GlobalEventService,
		private userBlockingService: UserBlockingService,
		private apRendererService: ApRendererService,
		private apDeliverManagerService: ApDeliverManagerService,
	) {
	}

	@bindThis
	public async vote(user: MiUser, note: MiNote, choice: number) {
		const poll = await this.pollsRepository.findOneBy({ noteId: note.id });

		if (poll == null) throw new Error('poll not found');

		// Check whether is valid choice
		if (poll.choices[choice] == null) throw new Error('invalid choice param');

		// Check blocking
		if (note.userId !== user.id) {
			const blocked = await this.userBlockingService.checkBlocked(note.userId, user.id);
			if (blocked) {
				throw new Error('blocked');
			}
		}

		// if already voted
		const exist = await this.pollVotesRepository.findBy({
			noteId: note.id,
			userId: user.id,
		});

		if (poll.multiple) {
			if (exist.some(x => x.choice === choice)) {
				throw new Error('already voted');
			}
		} else if (exist.length !== 0) {
			throw new Error('already voted');
		}

		await this.pollVotesRepository.insert({
			id: this.idService.gen(),
			noteId: note.id,
			userId: user.id,
			choice: choice,
		});

		// Increment votes count
		const index = choice + 1; // In SQL, array index is 1 based
		await this.pollsRepository.query('UPDATE poll SET votes[$1] = votes[$1] + 1 WHERE "noteId" = $2', [index, poll.noteId]);

		this.globalEventService.publishNoteStream(note, 'pollVoted', {
			choice: choice,
			userId: user.id,
		});
	}

	@bindThis
	public async deliverQuestionUpdate(noteId: MiNote['id']) {
		const note = await this.notesRepository.findOneBy({ id: noteId });
		if (note == null) throw new Error('note not found');

		if (note.localOnly) return;

		const user = await this.usersRepository.findOneBy({ id: note.userId });
		if (user == null) throw new Error('note not found');

		if (!this.userEntityService.isLocalUser(user)) return;

		const content = this.apRendererService.addContext(this.apRendererService.renderUpdate(await this.apRendererService.renderNote(note, false), user));
		const dm = this.apDeliverManagerService.createDeliverManager(user, content);

		// ノート作成時 (NoteCreateService) と同じ配送先に絞り、公開範囲外へ Update を送らない。
		// specified は閲覧を許可されたユーザーだけに送る (非公開化したノートには以前のメンションが残るため)
		const directRecipientIds = note.visibility === 'specified'
			? note.visibleUserIds
			: [...note.mentions, note.replyUserId, note.renoteUserId].filter((id): id is MiUser['id'] => id != null);
		if (directRecipientIds.length > 0) {
			const remoteRecipients = await this.usersRepository.findBy({
				id: In(directRecipientIds),
				host: Not(IsNull()),
			}) as MiRemoteUser[];
			for (const u of remoteRecipients) {
				dm.addDirectRecipe(u);
			}
		}

		if (['public', 'public_non_ltl', 'home', 'followers'].includes(note.visibility)) {
			if (note.deliveryTargets) {
				dm.addSelectiveFollowersRecipe(note.deliveryTargets);
			} else {
				dm.addFollowersRecipe();
			}
		}

		if (['public', 'public_non_ltl'].includes(note.visibility)) {
			this.relayService.deliverToRelays(user, content, note.deliveryTargets);
		}

		await dm.execute();
	}
}
