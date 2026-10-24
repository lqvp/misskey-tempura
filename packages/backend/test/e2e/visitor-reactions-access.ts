/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { beforeAll, describe, test } from 'vitest';
import { api, post, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

// notes/replies, notes/renotes, notes/quotes の匿名アクセスは
// サーバー設定の個別フラグ(既定 off)で制御されること。
// off の間は従来通り空配列、on にすると匿名でも実データを返す。
describe('visitor reactions access switches', () => {
	let admin: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let note: misskey.entities.Note;

	beforeAll(async () => {
		// 最初のサインアップユーザーは管理者になる
		admin = await signup({ username: 'admin_react' });
		bob = await signup({ username: 'bob_react' });
		note = await post(admin, { text: 'reaction access target' });
		await post(bob, { text: 'a reply', replyId: note.id });
		await post(bob, { renoteId: note.id });
		await post(bob, { text: 'a quote', renoteId: note.id });
	}, 1000 * 60 * 2);

	test('匿名は notes/replies のフラグが off の間空の応答', async () => {
		const res = await api('notes/replies', { noteId: note.id });
		assert.strictEqual(res.status, 200);
		assert.deepStrictEqual(res.body, []);
	});

	test('フラグを on にすると匿名でも notes/replies を返す', async () => {
		await api('admin/update-meta', { allowAnonymousReplies: true }, admin);
		const res = await api('notes/replies', { noteId: note.id });
		assert.strictEqual(res.status, 200);
		assert.ok(Array.isArray(res.body) && res.body.length === 1);
		await api('admin/update-meta', { allowAnonymousReplies: false }, admin);
		const res2 = await api('notes/replies', { noteId: note.id });
		assert.deepStrictEqual(res2.body, []);
	});

	test('匿名は notes/renotes のフラグが off の間空の応答', async () => {
		const res = await api('notes/renotes', { noteId: note.id });
		assert.strictEqual(res.status, 200);
		assert.deepStrictEqual(res.body, []);
	});

	test('フラグを on にすると匿名でも notes/renotes を返す', async () => {
		await api('admin/update-meta', { allowAnonymousRenotes: true }, admin);
		const res = await api('notes/renotes', { noteId: note.id });
		assert.strictEqual(res.status, 200);
		// 引用を除く純粋なリノートのみが返る
		assert.ok(Array.isArray(res.body) && res.body.length === 1);
		await api('admin/update-meta', { allowAnonymousRenotes: false }, admin);
	});

	test('匿名は notes/quotes のフラグが off の間空の応答', async () => {
		const res = await api('notes/quotes', { noteId: note.id });
		assert.strictEqual(res.status, 200);
		assert.deepStrictEqual(res.body, []);
	});

	test('フラグを on にすると匿名でも notes/quotes を返す', async () => {
		await api('admin/update-meta', { allowAnonymousQuotes: true }, admin);
		const res = await api('notes/quotes', { noteId: note.id });
		assert.strictEqual(res.status, 200);
		assert.ok(Array.isArray(res.body) && res.body.length === 1);
		await api('admin/update-meta', { allowAnonymousQuotes: false }, admin);
	});

	test('フラグは独立(replies を on にしても quotes は遮断のまま)', async () => {
		await api('admin/update-meta', { allowAnonymousReplies: true }, admin);
		const quotesRes = await api('notes/quotes', { noteId: note.id });
		assert.deepStrictEqual(quotesRes.body, []);
		await api('admin/update-meta', { allowAnonymousReplies: false }, admin);
	});

	test('ログイン済みユーザーはフラグに関係なく取得できる', async () => {
		const res = await api('notes/replies', { noteId: note.id }, bob);
		assert.strictEqual(res.status, 200);
		assert.ok(Array.isArray(res.body) && res.body.length === 1);
	});
});
