/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import { FindOperator, In, IsNull, Not } from 'typeorm';
import type { FollowingsRepository, NotesRepository, UsersRepository } from '@/models/_.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { PollService } from '@/core/PollService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { QueueService } from '@/core/QueueService.js';
import { RelayService } from '@/core/RelayService.js';
import { LoggerService } from '@/core/LoggerService.js';

describe('PollService.deliverQuestionUpdate', () => {
	let service: PollService;
	const notes = mockDeep<NotesRepository>();
	const users = mockDeep<UsersRepository>();
	const followings = mockDeep<FollowingsRepository>();
	const queue = mockDeep<QueueService>();
	const relay = mockDeep<RelayService>();
	const renderer = mockDeep<ApRendererService>();
	const userEntity = mockDeep<UserEntityService>();

	const author = { id: 'author', host: null } as MiUser;
	const followerInbox = 'https://follower.example.com/inbox';
	const mentionedInbox = 'https://mentioned.example.com/users/mentioned/inbox';
	const mentioned = { id: 'mentioned', host: 'mentioned.example.com', inbox: mentionedInbox, sharedInbox: null } as MiUser;
	const activity = { type: 'Update' };
	const quotedInbox = 'https://quoted.example.com/users/quoted/inbox';
	const quoted = { id: 'quoted', host: 'quoted.example.com', inbox: quotedInbox, sharedInbox: null } as MiUser;
	const repliedInbox = 'https://replied.example.com/users/replied/inbox';
	const replied = { id: 'replied', host: 'replied.example.com', inbox: repliedInbox, sharedInbox: null } as MiUser;
	const remoteUsers = [mentioned, quoted, replied];

	const baseNote = {
		id: 'note',
		userId: author.id,
		userHost: null,
		visibility: 'public',
		localOnly: false,
		mentions: [] as string[],
		replyUserId: null,
		renoteUserId: null,
		visibleUserIds: [] as string[],
		deliveryTargets: null,
	} as unknown as MiNote;

	function givenNote(overrides: Partial<MiNote>) {
		notes.findOneBy.mockResolvedValue({ ...baseNote, ...overrides } as MiNote);
	}

	function deliveredInboxes(): string[] {
		const call = queue.deliverMany.mock.lastCall;
		return call ? [...call[2].keys()] : [];
	}

	beforeEach(async () => {
		for (const m of [notes, users, followings, queue, relay, renderer, userEntity]) mockReset(m);

		const module = await Test.createTestingModule({
			providers: [
				PollService,
				ApDeliverManagerService,
				{ provide: DI.notesRepository, useValue: notes },
				{ provide: DI.usersRepository, useValue: users },
				{ provide: DI.followingsRepository, useValue: followings },
				{ provide: QueueService, useValue: queue },
				{ provide: RelayService, useValue: relay },
				{ provide: ApRendererService, useValue: renderer },
				{ provide: UserEntityService, useValue: userEntity },
				{ provide: LoggerService, useValue: { getLogger: () => ({ createSubLogger: () => ({ warn: vi.fn() }) }) } },
			],
		}).useMocker(() => mockDeep()).compile();
		service = module.get(PollService);

		users.findOneBy.mockResolvedValue(author);
		users.findBy.mockImplementation((async (where: { id: FindOperator<string[]> }) => remoteUsers.filter(u => where.id.value.includes(u.id))) as never);
		followings.find.mockResolvedValue([
			{ followerSharedInbox: null, followerInbox },
		] as Awaited<ReturnType<FollowingsRepository['find']>>);
		userEntity.isLocalUser.mockImplementation(((u: MiUser) => u.host == null) as never);
		renderer.renderNote.mockResolvedValue({} as never);
		renderer.renderUpdate.mockReturnValue(activity as never);
		renderer.addContext.mockImplementation(((x: unknown) => x) as never);
	});

	test.each(['public', 'public_non_ltl'] as const)('%s はフォロワーとリレーに配送する', async visibility => {
		givenNote({ visibility });

		await service.deliverQuestionUpdate('note');

		expect(deliveredInboxes()).toEqual([followerInbox]);
		expect(relay.deliverToRelays).toHaveBeenCalledExactlyOnceWith(author, activity, null);
	});

	test.each(['home', 'followers'] as const)('%s はフォロワーに配送し、リレーには配送しない', async visibility => {
		givenNote({ visibility });

		await service.deliverQuestionUpdate('note');

		expect(deliveredInboxes()).toEqual([followerInbox]);
		expect(relay.deliverToRelays).not.toHaveBeenCalled();
	});

	test('specified は宛先のリモートユーザーだけに配送し、フォロワーとリレーには配送しない', async () => {
		givenNote({ visibility: 'specified', mentions: [mentioned.id], visibleUserIds: [mentioned.id] });

		await service.deliverQuestionUpdate('note');

		expect(users.findBy).toHaveBeenCalledWith({ id: In([mentioned.id]), host: Not(IsNull()) });
		expect(followings.find).not.toHaveBeenCalled();
		expect(deliveredInboxes()).toEqual([mentionedInbox]);
		expect(relay.deliverToRelays).not.toHaveBeenCalled();
	});

	test('非公開化した specified のノートは、閲覧を許可されていない以前のメンション先に配送しない', async () => {
		givenNote({ visibility: 'specified', mentions: [mentioned.id], visibleUserIds: [] });

		await service.deliverQuestionUpdate('note');

		expect(deliveredInboxes()).toEqual([]);
		expect(relay.deliverToRelays).not.toHaveBeenCalled();
	});

	test('specified は閲覧を許可されたメンション先にだけ配送し、許可されていないメンション先には配送しない', async () => {
		givenNote({ visibility: 'specified', mentions: [mentioned.id, quoted.id], visibleUserIds: [mentioned.id] });

		await service.deliverQuestionUpdate('note');

		expect(deliveredInboxes()).toEqual([mentionedInbox]);
	});

	test('メンションされたリモートユーザーにはフォロワーでなくても配送する', async () => {
		givenNote({ visibility: 'followers', mentions: [mentioned.id] });

		await service.deliverQuestionUpdate('note');

		expect(deliveredInboxes()).toEqual([followerInbox, mentionedInbox]);
	});

	test('リプライ先・引用元のリモートユーザーにもフォロワーでなくても配送する', async () => {
		givenNote({ visibility: 'home', replyUserId: replied.id, renoteUserId: quoted.id });

		await service.deliverQuestionUpdate('note');

		expect(deliveredInboxes()).toEqual([followerInbox, quotedInbox, repliedInbox]);
	});

	test('配送先制御 (deliveryTargets) をフォロワーとリレーの両方に適用する', async () => {
		const deliveryTargets = { mode: 'include' as const, hosts: ['follower.example.com'] };
		givenNote({ visibility: 'public', deliveryTargets });

		await service.deliverQuestionUpdate('note');

		expect(followings.find).toHaveBeenCalledWith(expect.objectContaining({
			where: expect.objectContaining({ followerHost: In(deliveryTargets.hosts) }),
		}));
		expect(relay.deliverToRelays).toHaveBeenCalledExactlyOnceWith(author, activity, deliveryTargets);
	});

	test('連合なし (localOnly) のノートはどこにも配送しない', async () => {
		givenNote({ localOnly: true });

		await service.deliverQuestionUpdate('note');

		expect(queue.deliverMany).not.toHaveBeenCalled();
		expect(relay.deliverToRelays).not.toHaveBeenCalled();
	});

	test('リモートユーザーのノートは配送しない', async () => {
		givenNote({ userHost: 'remote.example.com' });
		users.findOneBy.mockResolvedValue({ id: 'author', host: 'remote.example.com' } as MiUser);

		await service.deliverQuestionUpdate('note');

		expect(queue.deliverMany).not.toHaveBeenCalled();
		expect(relay.deliverToRelays).not.toHaveBeenCalled();
	});

	test('ノートが存在しない場合はエラーにする', async () => {
		notes.findOneBy.mockResolvedValue(null);

		await expect(service.deliverQuestionUpdate('note')).rejects.toThrow('note not found');
	});
});
