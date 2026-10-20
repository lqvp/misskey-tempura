/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import Channel from '@/server/api/stream/channel.js';
import type { Packed } from '@/misc/json-schema.js';

class TestChannel extends Channel {
	public readonly chName = 'test';
	public init() {}
	public run(note: Packed<'Note'>, noteEntityService: any) {
		return this.withMyRenoteReaction(note, noteEntityService);
	}
}

function deepFreeze<T>(value: T): T {
	if (value != null && typeof value === 'object') {
		for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
		Object.freeze(value);
	}
	return value;
}

function channelFor(userId: string | null) {
	return new TestChannel({ id: 'c', connection: { user: userId ? { id: userId } : null } } as any);
}

const pureRenote = () => deepFreeze({
	id: 'renote',
	renoteId: 'original',
	text: null,
	fileIds: [],
	poll: null,
	renote: { id: 'original', reactions: { '👍': 1 } },
} as unknown as Packed<'Note'>);

describe('Channel.withMyRenoteReaction', () => {
	test('共有しているノートを書き換えずに、自分のリアクションを付けたコピーを返す', async () => {
		const note = pureRenote();
		const noteEntityService = { populateMyReaction: vi.fn(async () => '👍') };

		const result = await channelFor('me').run(note, noteEntityService);

		expect(result.renote?.myReaction).toBe('👍');
		expect(note.renote?.myReaction).toBeUndefined();
		expect(noteEntityService.populateMyReaction).toHaveBeenCalledWith(note.renote, 'me');
	});

	test('未ログインならそのまま返す', async () => {
		const note = pureRenote();
		const noteEntityService = { populateMyReaction: vi.fn() };

		expect(await channelFor(null).run(note, noteEntityService)).toBe(note);
		expect(noteEntityService.populateMyReaction).not.toHaveBeenCalled();
	});

	test('引用リノートはそのまま返す', async () => {
		const note = deepFreeze({ ...pureRenote(), text: 'quote' } as Packed<'Note'>);
		const noteEntityService = { populateMyReaction: vi.fn() };

		expect(await channelFor('me').run(note, noteEntityService)).toBe(note);
	});
});
