/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test, vi } from 'vitest';
import type { Note } from 'misskey-js/entities.js';
import { Paginator } from '@/utility/paginator.js';

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn() }));

const notes = (start: number, count: number): Note[] => Array.from({ length: count }, (_, i) => ({
	id: String(start + i).padStart(4, '0'),
	createdAt: '2026-01-01T00:00:00Z',
} as Note));

test('retained IDs track queue eviction and release even at a constant queue size', () => {
	const paginator = new Paginator('antennas/notes', {});
	paginator.prepend(notes(0, 1)[0]);
	for (const note of notes(1, 101)) paginator.enqueue(note);
	expect(paginator.getRetainedIds().size).toBe(101);
	expect(paginator.getRetainedIds().has('0000')).toBe(true);
	expect(paginator.getRetainedIds().has('0001')).toBe(false);
	expect(paginator.getRetainedIds().has('0101')).toBe(true);

	paginator.releaseQueue();
	expect(paginator.getRetainedIds().size).toBe(30);
	expect(paginator.getRetainedIds().has('0000')).toBe(false);
	expect(paginator.getRetainedIds().has('0101')).toBe(true);
});
