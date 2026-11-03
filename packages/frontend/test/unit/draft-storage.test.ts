/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { beforeEach, expect, test, vi } from 'vitest';
import { saveDraftItem, readDraftItem, deleteDraftItem, migrateDraftItems } from '@/utility/draft-storage.js';
vi.mock('@/preferences/lock.js', () => ({ withPreferenceLock: (work: () => unknown) => Promise.resolve(work()) }));
beforeEach(() => localStorage.clear());

test('independent account and target draft writes/deletes preserve each other', () => {
 saveDraftItem('drafts', 'a::reply:n', { data: 'a' });
 saveDraftItem('drafts', 'b::reply:n', { data: 'b' });
 saveDraftItem('chatMessageDrafts', 'a::reply:n', { data: 'chat' });
 deleteDraftItem('drafts', 'a::reply:n');
 expect(readDraftItem('drafts', 'a::reply:n')).toBeUndefined();
 expect(readDraftItem('drafts', 'b::reply:n')).toEqual({ data: 'b' });
 expect(readDraftItem('chatMessageDrafts', 'a::reply:n')).toEqual({ data: 'chat' });
});

test('migration retains originals and new values; deleted items never resurrect', async () => {
 localStorage.setItem('drafts', JSON.stringify({ 'note:a': { data: 'old' }, 'reply:n': { data: 'unknown' } }));
 saveDraftItem('drafts', 'a::note:a', { data: 'new' });
 await migrateDraftItems(['a', 'b']);
 expect(readDraftItem('drafts', 'a::note:a')).toEqual({ data: 'new' });
 expect(readDraftItem('drafts', 'a::reply:n')).toBeUndefined();
 deleteDraftItem('drafts', 'a::note:a');
 await migrateDraftItems(['a', 'b']);
 expect(readDraftItem('drafts', 'a::note:a')).toBeUndefined();
 expect(JSON.parse(localStorage.getItem('drafts')!)).toHaveProperty('note:a');
});
