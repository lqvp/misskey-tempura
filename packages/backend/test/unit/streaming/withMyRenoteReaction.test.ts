/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import type { Packed } from '@/misc/json-schema.js';

function deepFreeze<T>(value: T): T {
	if (value != null && typeof value === 'object') {
		for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
		Object.freeze(value);
	}
	return value;
}

function serviceFor(populateMyReaction: ReturnType<typeof vi.fn>) {
	// 依存を組み立てずに、テスト対象のメソッドだけを呼び出す
	return (note: Packed<'Note'>, meId: string | null) =>
		NoteEntityService.prototype.withMyRenoteReaction.call({ populateMyReaction } as unknown as NoteEntityService, note, meId);
}

const pureRenote = () => deepFreeze({
	id: 'renote',
	renoteId: 'original',
	text: null,
	fileIds: [],
	poll: null,
	renote: { id: 'original', reactions: { '👍': 1 } },
} as unknown as Packed<'Note'>);

describe('NoteEntityService.withMyRenoteReaction', () => {
	test('共有しているノートを書き換えずに、自分のリアクションを付けたコピーを返す', async () => {
		const note = pureRenote();
		const populateMyReaction = vi.fn(async () => '👍');

		const result = await serviceFor(populateMyReaction)(note, 'me');

		expect(result.renote?.myReaction).toBe('👍');
		expect(note.renote?.myReaction).toBeUndefined();
		expect(populateMyReaction).toHaveBeenCalledWith(note.renote, 'me');
	});

	test('未ログインならそのまま返す', async () => {
		const note = pureRenote();
		const populateMyReaction = vi.fn();

		expect(await serviceFor(populateMyReaction)(note, null)).toBe(note);
		expect(populateMyReaction).not.toHaveBeenCalled();
	});

	test('引用リノートはそのまま返す', async () => {
		const note = deepFreeze({ ...pureRenote(), text: 'quote' } as Packed<'Note'>);
		const populateMyReaction = vi.fn();

		expect(await serviceFor(populateMyReaction)(note, 'me')).toBe(note);
		expect(populateMyReaction).not.toHaveBeenCalled();
	});
});
