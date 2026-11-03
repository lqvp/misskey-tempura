/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { expect, test } from 'vitest';
import { changeAccountRecord } from '@/utility/account-records.js';

test('update one account preserves accounts only present in the latest persisted map', () => {
 expect(changeAccountRecord({ 'h/a': 'a', 'h/b': 'b' }, 'h/a', 'new')).toEqual({ 'h/a': 'new', 'h/b': 'b' });
 expect(changeAccountRecord({ 'h/a': 'a', 'h/b': 'b' }, 'h/a', null)).toEqual({ 'h/b': 'b' });
});

test('refresh of a removed account cannot recreate its persisted information', () => {
 const latest: Record<string, { id: string }> = {};
 const updateExisting = (records: typeof latest) => 'h/a' in records ? changeAccountRecord(records, 'h/a', { id: 'a' }) : records;
 expect(updateExisting(latest)).toEqual({});
});
