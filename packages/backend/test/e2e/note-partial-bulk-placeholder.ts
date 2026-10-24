/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { beforeAll, describe, test } from 'vitest';
import { api, post, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

// notes/show-partial-bulk (fetchDiffs) の隠匿対象ノートの扱いは、pack 層の
// プレースホルダ(isHidden)と同じ方針に統一されていること(#617 item 9)。
// pack 層のプレースホルダは id・件数を残すため、部分形状(id + リアクション)でも
// ユーザー個別の非公開設定ではエントリを落とさない。
// サーバーの visitor ポリシー(ugcVisibilityForVisitor)と閲覧不可ノート
// (visibility によるアクセス制御)は従来どおり返さない。
describe('notes/show-partial-bulk placeholder consistency', () => {
	let admin: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let note: misskey.entities.Note;

	beforeAll(async () => {
		// 最初のサインアップユーザーは管理者になる
		admin = await signup({ username: 'admin_pbulk' });
		bob = await signup({ username: 'bob_pbulk' });
		note = await post(admin, { text: 'partial bulk target' });
		await api('notes/reactions/create', { noteId: note.id, reaction: '❤️' }, bob);
	}, 1000 * 60 * 2);

	test('匿名は通常時に id とリアクション件数を取得できる', async () => {
		const res = await api('notes/show-partial-bulk', { noteIds: [note.id] });
		assert.strictEqual(res.status, 200);
		assert.strictEqual(res.body.length, 1);
		assert.strictEqual(res.body[0].id, note.id);
		// キー名は legacy 変換で正規化され得るため合計件数で検証する
		const total = Object.values(res.body[0].reactions as Record<string, number>).reduce((a, b) => a + b, 0);
		assert.strictEqual(total, 1);
	});

	test('ugcVisibilityForVisitor=none の間は匿名には返さない(ログイン済みは取得できる)', async () => {
		await api('admin/update-meta', { ugcVisibilityForVisitor: 'none' }, admin);
		try {
			const res = await api('notes/show-partial-bulk', { noteIds: [note.id] });
			assert.strictEqual(res.status, 200);
			assert.deepStrictEqual(res.body, []);
			const res2 = await api('notes/show-partial-bulk', { noteIds: [note.id] }, bob);
			assert.strictEqual(res2.status, 200);
			assert.strictEqual(res2.body.length, 1);
		} finally {
			await api('admin/update-meta', { ugcVisibilityForVisitor: 'all' }, admin);
		}
	});

	test('hidePublicNotes のノートは pack のプレースホルダと同じく匿名にも件数を返す', async () => {
		const updateRes = await api('i/update', { hidePublicNotes: true }, admin);
		assert.strictEqual(updateRes.status, 200);
		assert.strictEqual(updateRes.body.hidePublicNotes, true);
		try {
			const res = await api('notes/show-partial-bulk', { noteIds: [note.id] });
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.length, 1);
			assert.strictEqual(res.body[0].id, note.id);
		} finally {
			await api('i/update', { hidePublicNotes: false }, admin);
		}
	});

	test('閲覧不可ノート(フォロワー限定)は従来どおり返さない', async () => {
		const followersNote = await post(admin, { text: 'followers only', visibility: 'followers' });
		const res = await api('notes/show-partial-bulk', { noteIds: [note.id, followersNote.id] });
		assert.strictEqual(res.status, 200);
		assert.strictEqual(res.body.length, 1);
		assert.strictEqual(res.body[0].id, note.id);
		// ログイン済みでも非フォロワーには返らない
		const res2 = await api('notes/show-partial-bulk', { noteIds: [note.id, followersNote.id] }, bob);
		assert.strictEqual(res2.body.length, 1);
	});
});
