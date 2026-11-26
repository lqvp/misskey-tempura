/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { UserListChannel } from '@/server/api/stream/channels/user-list.js';
import type { UserListMembershipsRepository, UserListsRepository } from '@/models/_.js';
import type { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import type { NoteStreamingHidingService } from '@/server/api/stream/NoteStreamingHidingService.js';
import type { ChannelRequest } from '@/server/api/stream/channel.js';
import type { Packed } from '@/misc/json-schema.js';

type SentEvent = { type: string; body: unknown };

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function makeNote(overrides: Partial<Packed<'Note'>> & { id: string; userId: string }): Packed<'Note'> {
	return {
		user: { id: overrides.userId, host: null },
		text: 'hello',
		visibility: 'public',
		channelId: null,
		fileIds: [],
		renoteId: null,
		replyId: null,
		reply: null,
		...overrides,
	} as unknown as Packed<'Note'>;
}

function createChannel() {
	const subscriber = new EventEmitter();
	const sent: SentEvent[] = [];
	const userListsExists = vi.fn().mockResolvedValue(true);
	const membershipsFind = vi.fn().mockResolvedValue([]);

	const connection = {
		user: { id: 'me' },
		userProfile: {},
		following: {},
		userIdsWhoMeMuting: new Set<string>(),
		userIdsWhoMeMutingRenotes: new Set<string>(),
		userIdsWhoBlockingMe: new Set<string>(),
		userMutedInstances: new Set<string>(),
		followingChannels: new Set<string>(),
		mutingChannels: new Set<string>(),
		subscriber,
		sendMessageToWs: (_kind: string, payload: { id: string; type: string; body: unknown }) => {
			sent.push({ type: payload.type, body: payload.body });
		},
	};

	const channel = new UserListChannel(
		{ exists: userListsExists } as unknown as UserListsRepository,
		{ find: membershipsFind } as unknown as UserListMembershipsRepository,
		{ id: 'ch1', connection } as unknown as ChannelRequest,
		{ withMyRenoteReaction: vi.fn(async (note: Packed<'Note'>) => note) } as unknown as NoteEntityService,
		{ filter: vi.fn(async (note: Packed<'Note'>) => note) } as unknown as NoteStreamingHidingService,
	);

	return {
		channel,
		subscriber,
		sent,
		userListsExists,
		membershipsFind,
	};
}

async function flushMicrotasks(turns = 10): Promise<void> {
	for (let i = 0; i < turns; i++) {
		await Promise.resolve();
	}
}

describe('UserListChannel', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0.5); // jitter factor = 1.0
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	test('retries after initial init() find() failure and delivers matching notes once recovered', async () => {
		const { channel, subscriber, sent, membershipsFind } = createChannel();
		membershipsFind
			.mockRejectedValueOnce(new Error('transient db error'))
			.mockResolvedValueOnce([{ userId: 'member1', withReplies: false }]);

		const ok = await channel.init({ listId: 'list1' });
		expect(ok).toBe(true);
		await flushMicrotasks();

		expect(membershipsFind).toHaveBeenCalledTimes(1);

		// Before retry succeeds, notes are not delivered yet
		subscriber.emit('notesStream', makeNote({ id: 'n1', userId: 'member1' }));
		await flushMicrotasks();
		expect(sent).toEqual([]);

		// Does not fire before backoff elapses (1000ms with random=0.5)
		await vi.advanceTimersByTimeAsync(999);
		expect(membershipsFind).toHaveBeenCalledTimes(1);

		// Fires at 1000ms and populates membershipsMap
		await vi.advanceTimersByTimeAsync(1);
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(2);

		subscriber.emit('notesStream', makeNote({ id: 'n2', userId: 'member1' }));
		await flushMicrotasks();
		expect(sent).toHaveLength(1);
		expect(sent[0].type).toBe('note');
		expect((sent[0].body as Packed<'Note'>).id).toBe('n2');

		channel.dispose();
	});

	test('retries after internalMembershipUpdated find() failure and applies member removals, additions, and withReplies changes', async () => {
		const { channel, subscriber, sent, membershipsFind } = createChannel();
		membershipsFind
			.mockResolvedValueOnce([
				{ userId: 'removedUser', withReplies: false },
				{ userId: 'replyUser', withReplies: false },
			])
			.mockRejectedValueOnce(new Error('db timeout'))
			.mockResolvedValueOnce([
				{ userId: 'addedUser', withReplies: false },
				{ userId: 'replyUser', withReplies: true },
			]);

		await channel.init({ listId: 'list1' });
		await flushMicrotasks();

		const replyTarget = makeNote({ id: 'target1', userId: 'otherUser' });

		// Initial state: replyUser has withReplies=false, so reply to third-party is skipped
		subscriber.emit('notesStream', makeNote({ id: 'n-reply-before', userId: 'replyUser', reply: replyTarget }));
		await flushMicrotasks();
		expect(sent).toEqual([]);

		// Membership update fails once
		subscriber.emit('userListStream:list1', { type: 'internalMembershipUpdated', body: { userId: 'addedUser' } });
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(2);

		// Advance past retry delay -> succeeds and refreshes membershipsMap
		await vi.advanceTimersByTimeAsync(1000);
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(3);

		// Removed user no longer receives notes
		subscriber.emit('notesStream', makeNote({ id: 'n-removed', userId: 'removedUser' }));
		// Added user now receives notes
		subscriber.emit('notesStream', makeNote({ id: 'n-added', userId: 'addedUser' }));
		// replyUser now has withReplies=true so reply to third-party is delivered
		subscriber.emit('notesStream', makeNote({ id: 'n-reply-after', userId: 'replyUser', reply: replyTarget }));
		await flushMicrotasks();

		expect(sent.map(e => (e.body as Packed<'Note'>).id)).toEqual(['n-added', 'n-reply-after']);

		channel.dispose();
	});

	test('cancels pending retry when a newer internalMembershipUpdated arrives and ignores stale failures/resolutions', async () => {
		const { channel, subscriber, sent, membershipsFind } = createChannel();
		const staleInFlight = deferred<Array<{ userId: string; withReplies: boolean }>>();

		membershipsFind
			.mockRejectedValueOnce(new Error('initial failure'))
			.mockReturnValueOnce(staleInFlight.promise)
			.mockResolvedValueOnce([{ userId: 'latestMember', withReplies: false }]);

		await channel.init({ listId: 'list1' });
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(1);

		// Retry is now pending for 1000ms. Fire a newer update at 500ms.
		await vi.advanceTimersByTimeAsync(500);
		subscriber.emit('userListStream:list1', { type: 'internalMembershipUpdated', body: { userId: 'midMember' } });
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(2);

		// Fire an even newer update while the 2nd fetch is still in flight
		subscriber.emit('userListStream:list1', { type: 'internalMembershipUpdated', body: { userId: 'latestMember' } });
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(3);

		// Stale 2nd fetch resolves later with outdated member -> must be ignored
		staleInFlight.resolve([{ userId: 'staleMember', withReplies: false }]);
		await flushMicrotasks();

		// Advancing timers must not trigger the cancelled initial retry
		await vi.advanceTimersByTimeAsync(60_000);
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(3);

		subscriber.emit('notesStream', makeNote({ id: 'n-stale', userId: 'staleMember' }));
		subscriber.emit('notesStream', makeNote({ id: 'n-latest', userId: 'latestMember' }));
		await flushMicrotasks();

		expect(sent.map(e => (e.body as Packed<'Note'>).id)).toEqual(['n-latest']);

		channel.dispose();
	});

	test('does not schedule a retry when a superseded in-flight find() rejects', async () => {
		const { channel, subscriber, membershipsFind } = createChannel();
		const staleInFlight = deferred<Array<{ userId: string; withReplies: boolean }>>();

		membershipsFind
			.mockReturnValueOnce(staleInFlight.promise)
			.mockResolvedValueOnce([{ userId: 'freshMember', withReplies: false }]);

		await channel.init({ listId: 'list1' });
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(1);

		// Newer update supersedes initial fetch and succeeds
		subscriber.emit('userListStream:list1', { type: 'internalMembershipUpdated', body: { userId: 'freshMember' } });
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(2);

		// Now the stale initial fetch rejects -> must NOT schedule a retry
		staleInFlight.reject(new Error('stale db error'));
		await flushMicrotasks();

		await vi.advanceTimersByTimeAsync(60_000);
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(2);

		channel.dispose();
	});

	test('internalListDeleted cancels pending retry and prevents late in-flight find() from repopulating membershipsMap', async () => {
		const { channel, subscriber, sent, membershipsFind } = createChannel();
		const inFlight = deferred<Array<{ userId: string; withReplies: boolean }>>();

		membershipsFind
			.mockRejectedValueOnce(new Error('initial failure'))
			.mockReturnValueOnce(inFlight.promise);

		await channel.init({ listId: 'list1' });
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(1);

		// Trigger retry 1 -> now in flight
		await vi.advanceTimersByTimeAsync(1000);
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(2);

		// List is deleted while fetch is in flight
		subscriber.emit('userListStream:list1', { type: 'internalListDeleted', body: null });
		await flushMicrotasks();

		// Late resolution must NOT repopulate membershipsMap
		inFlight.resolve([{ userId: 'member1', withReplies: false }]);
		await flushMicrotasks();

		subscriber.emit('notesStream', makeNote({ id: 'n1', userId: 'member1' }));
		await flushMicrotasks();
		expect(sent).toEqual([]);

		// Even if another membership update arrives after deletion, no fetch or retry runs
		subscriber.emit('userListStream:list1', { type: 'internalMembershipUpdated', body: { userId: 'member1' } });
		await vi.advanceTimersByTimeAsync(60_000);
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(2);

		channel.dispose();
	});

	test('internalListDeleted cancels an active pending retry timer before it fires', async () => {
		const { channel, subscriber, membershipsFind } = createChannel();
		membershipsFind.mockRejectedValue(new Error('db down'));

		await channel.init({ listId: 'list1' });
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(1);

		subscriber.emit('userListStream:list1', { type: 'internalListDeleted', body: null });
		await vi.advanceTimersByTimeAsync(60_000);
		await flushMicrotasks();

		expect(membershipsFind).toHaveBeenCalledTimes(1);
		channel.dispose();
	});

	test('dispose() cancels pending retry and prevents late in-flight find() from updating membershipsMap', async () => {
		const { channel, subscriber, sent, membershipsFind } = createChannel();
		const inFlight = deferred<Array<{ userId: string; withReplies: boolean }>>();

		membershipsFind
			.mockRejectedValueOnce(new Error('initial failure'))
			.mockReturnValueOnce(inFlight.promise);

		await channel.init({ listId: 'list1' });
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(1);

		// Retry 1 starts and stays in flight
		await vi.advanceTimersByTimeAsync(1000);
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(2);

		channel.dispose();

		// Late resolution after dispose must not populate membershipsMap
		inFlight.resolve([{ userId: 'member1', withReplies: false }]);
		await flushMicrotasks();

		expect((channel as unknown as { membershipsMap: Record<string, unknown> }).membershipsMap).toEqual({});

		// Listeners are removed and no further retries fire
		subscriber.emit('notesStream', makeNote({ id: 'n1', userId: 'member1' }));
		await vi.advanceTimersByTimeAsync(60_000);
		await flushMicrotasks();
		expect(sent).toEqual([]);
		expect(membershipsFind).toHaveBeenCalledTimes(2);
	});

	test('dispose() cancels a pending retry timer before it fires', async () => {
		const { channel, membershipsFind } = createChannel();
		membershipsFind.mockRejectedValue(new Error('db down'));

		await channel.init({ listId: 'list1' });
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(1);

		channel.dispose();

		await vi.advanceTimersByTimeAsync(60_000);
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(1);
	});

	test('gives up cleanly after MAX_FETCH_RETRIES (5) consecutive failures with exponential backoff', async () => {
		const { channel, membershipsFind } = createChannel();
		membershipsFind.mockRejectedValue(new Error('persistent db failure'));

		await channel.init({ listId: 'list1' });
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(1);

		// Exponential delays with random=0.5: 1000, 2000, 4000, 8000, 16000 ms
		const expectedDelays = [1000, 2000, 4000, 8000, 16000];
		for (let i = 0; i < expectedDelays.length; i++) {
			await vi.advanceTimersByTimeAsync(expectedDelays[i] - 1);
			await flushMicrotasks();
			expect(membershipsFind).toHaveBeenCalledTimes(i + 1);

			await vi.advanceTimersByTimeAsync(1);
			await flushMicrotasks();
			expect(membershipsFind).toHaveBeenCalledTimes(i + 2);
		}

		// After 1 initial + 5 retries = 6 total calls, no more retries are scheduled
		expect(membershipsFind).toHaveBeenCalledTimes(6);
		await vi.advanceTimersByTimeAsync(1_000_000);
		await flushMicrotasks();
		expect(membershipsFind).toHaveBeenCalledTimes(6);

		channel.dispose();
	});
});
