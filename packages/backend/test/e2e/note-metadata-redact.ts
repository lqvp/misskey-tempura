/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { beforeAll, describe, test } from 'vitest';
import { api, post, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

// deliveryTargets/deleteAt は配送ポリシーの内部情報であり、匿名(未ログイン)および
// 隠匿対象ノートにはどの経路でも開示されないこと。
// 従来 notes/show と notes/renotes でのみ個別に除去していたものを pack 側で全経路統一した。
describe('note metadata redaction', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let note: misskey.entities.Note;

	beforeAll(async () => {
		alice = await signup({ username: 'alice_redact' });
		bob = await signup({ username: 'bob_redact' });
		note = await post(alice, {
			text: 'metadata redact target',
			scheduledDelete: { deleteAt: Date.now() + 1000 * 60 * 60 },
			deliveryTargets: { mode: 'include', hosts: ['allowed.example.com'] },
		});
	}, 1000 * 60 * 2);

	test('ログイン済みなら notes/show で deleteAt と deliveryTargets を返す', async () => {
		const res = await api('notes/show', { noteId: note.id }, bob);
		assert.strictEqual(res.status, 200);
		assert.ok(res.body.deleteAt, 'deleteAt should be visible to logged-in users');
		assert.ok(res.body.deliveryTargets, 'deliveryTargets should be visible to logged-in users');
	});

	test('匿名の notes/show では deleteAt と deliveryTargets を返さない', async () => {
		const res = await api('notes/show', { noteId: note.id });
		assert.strictEqual(res.status, 200);
		assert.strictEqual(res.body.deleteAt, undefined);
		assert.strictEqual(res.body.deliveryTargets, undefined);
	});

	test('匿名のタイムライン経路(global-timeline)でも deleteAt と deliveryTargets を返さない', async () => {
		const res = await api('notes/global-timeline', { limit: 100 });
		assert.strictEqual(res.status, 200);
		const found = (res.body as misskey.entities.Note[]).find(n => n.id === note.id);
		assert.ok(found, 'note should appear on GTL for anonymous');
		assert.strictEqual(found.deleteAt, undefined);
		assert.strictEqual(found.deliveryTargets, undefined);
	});

	test('ログイン済みのタイムライン経路では従来通り返す', async () => {
		const res = await api('notes/global-timeline', { limit: 100 }, bob);
		assert.strictEqual(res.status, 200);
		const found = (res.body as misskey.entities.Note[]).find(n => n.id === note.id);
		assert.ok(found, 'note should appear on GTL');
		assert.ok(found.deleteAt, 'deleteAt should be visible to logged-in users on GTL');
		assert.ok(found.deliveryTargets, 'deliveryTargets should be visible to logged-in users on GTL');
	});
});
