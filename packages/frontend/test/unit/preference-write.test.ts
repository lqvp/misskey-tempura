/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { expect, test } from 'vitest';
import { mergePreferenceWrite, PreferenceWriteQueue } from '@/preferences/write.js';

const profile = (preferences: Record<string, unknown[]>) => ({ id: 'p', name: 'p', preferences });
const rec = (account: string, value: string) => [{ account }, value, {}];

test('stale snapshot changes only its changed scopes, preserving another account', () => {
 const original = profile({ folder: [rec('a', 'old-a'), rec('b', 'old-b')] });
 const latest = profile({ folder: [rec('a', 'new-a'), rec('b', 'old-b')] });
 const local = profile({ folder: [rec('a', 'old-a'), rec('b', 'new-b')] });
 expect(mergePreferenceWrite(original, local, latest).preferences.folder).toEqual([rec('a', 'new-a'), rec('b', 'new-b')]);
});

test('parallel writers enter the shared lock before reading latest data', async () => {
 let saved = profile({ folder: [rec('a', 'old-a'), rec('b', 'old-b')] });
 const original = structuredClone(saved);
 let tail = Promise.resolve();
 const lock = <T>(work: () => T) => { const result = tail.then(work); tail = result.then(() => {}, () => {}); return result; };
 const makeQueue = () => new PreferenceWriteQueue({ lock, read: () => structuredClone(saved), write: p => { saved = structuredClone(p); } });
 const a = makeQueue(); const b = makeQueue();
 await Promise.all([
  a.save(original, profile({ folder: [rec('a', 'new-a'), rec('b', 'old-b')] })),
  b.save(original, profile({ folder: [rec('a', 'old-a'), rec('b', 'new-b')] })),
 ]);
 expect(saved.preferences.folder).toEqual([rec('a', 'new-a'), rec('b', 'new-b')]);
});

test('a stale writer must not replace a restored different profile', () => {
 const old = profile({ folder: [rec('a', 'old')] });
 const changed = profile({ folder: [rec('a', 'new')] });
 const restored = { ...profile({ folder: [rec('a', 'restored')] }), id: 'restored' };
 expect(() => mergePreferenceWrite(old, changed, restored)).toThrow();
});


test('a pending save after logout must not recreate the cleared profile', () => {
 const old = profile({ folder: [rec('a', 'old')] });
 const changed = profile({ folder: [rec('a', 'new')] });
 expect(() => mergePreferenceWrite(old, changed, null)).toThrow();
});

test('a newly opened stale page merges rather than replacing an already-created profile', () => {
 const local = profile({ folder: [rec('a', 'a')] });
 const latest = profile({ folder: [rec('b', 'b')] });
 expect(mergePreferenceWrite(null, local, latest).preferences.folder).toEqual([rec('b', 'b'), rec('a', 'a')]);
});

test('parallel account additions preserve both memberships', () => {
 const a = ['h', { id: 'a', username: 'alice' }];
 const b = ['h', { id: 'b', username: 'bob' }];
 const record = (items: unknown[]) => [[{}, items, {}]];
 expect(mergePreferenceWrite(profile({ accounts: record([]) }), profile({ accounts: record([b]) }), profile({ accounts: record([a]) })).preferences.accounts).toEqual(record([a, b]));
});

test('account removal preserves another tab addition and stale edits do not resurrect removal', () => {
 const a = ['h', { id: 'a', username: 'alice' }];
 const b = ['h', { id: 'b', username: 'bob' }];
 const record = (items: unknown[]) => [[{}, items, {}]];
 expect(mergePreferenceWrite(profile({ accounts: record([a]) }), profile({ accounts: record([]) }), profile({ accounts: record([a, b]) })).preferences.accounts).toEqual(record([b]));
 expect(mergePreferenceWrite(profile({ accounts: record([a]) }), profile({ accounts: record([['h', { id: 'a', username: 'new' }]]) }), profile({ accounts: record([]) })).preferences.accounts).toEqual(record([]));
});

test('same-ID restore rejects writes from the previous storage revision', () => {
 const old = { ...profile({ folder: [rec('a', 'old')] }), storageRevision: 'before' };
 const changed = { ...old, preferences: { folder: [rec('a', 'new')] } };
 const restored = { ...old, storageRevision: 'restored' };
 expect(() => mergePreferenceWrite(old, changed, restored)).toThrow();
});

test('a transient write failure does not poison later saves or discard the failed edit', async () => {
 let saved = profile({ folder: [rec('a', 'old'), rec('b', 'old')] });
 const original = structuredClone(saved);
 let fail = true;
 const queue = new PreferenceWriteQueue({ lock: async work => work(), read: () => saved, write: p => { if (fail) throw new Error('quota'); saved = p; } });
 const first = profile({ folder: [rec('a', 'new'), rec('b', 'old')] });
 await expect(queue.save(original, first)).rejects.toThrow('quota');
 fail = false;
 await queue.save(first, profile({ folder: [rec('a', 'new'), rec('b', 'new')] }));
 await queue.flush();
 expect(saved.preferences.folder).toEqual([rec('a', 'new'), rec('b', 'new')]);
});
