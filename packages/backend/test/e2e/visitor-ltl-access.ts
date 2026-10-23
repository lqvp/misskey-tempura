/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { beforeAll, describe, test } from 'vitest';
import { api, post, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

// notes/local-timeline の匿名アクセスはサーバー設定のフラグ(既定 off)で制御されること。
// off の間は従来通り空配列、on にすると匿名でも実データを返す。
// なおリアルタイム購読(stream)の localTimeline チャンネルは従来どおり
// ロールポリシー ltlAvailable のみで制御され、このフラグでは変わらない。
describe('visitor local timeline switch', () => {
	let admin: misskey.entities.SignupResponse;
	let note: misskey.entities.Note;

	beforeAll(async () => {
		// 最初のサインアップユーザーは管理者になる
		admin = await signup({ username: 'admin_ltl' });
		note = await post(admin, { text: 'ltl access target' });
	}, 1000 * 60 * 2);

	test('匿名はフラグが off の間空の応答', async () => {
		const res = await api('notes/local-timeline', {});
		assert.strictEqual(res.status, 200);
		assert.deepStrictEqual(res.body, []);
	});

	test('フラグを on にすると匿名でも LTL を返す', async () => {
		await api('admin/update-meta', { allowAnonymousLocalTimeline: true }, admin);
		const res = await api('notes/local-timeline', {});
		assert.strictEqual(res.status, 200);
		assert.ok(Array.isArray(res.body) && res.body.some((n: misskey.entities.Note) => n.id === note.id));
		await api('admin/update-meta', { allowAnonymousLocalTimeline: false }, admin);
		const res2 = await api('notes/local-timeline', {});
		assert.deepStrictEqual(res2.body, []);
	});

	test('ログイン済みユーザーはフラグに関係なく取得できる', async () => {
		const res = await api('notes/local-timeline', {}, admin);
		assert.strictEqual(res.status, 200);
		assert.ok(Array.isArray(res.body) && res.body.some((n: misskey.entities.Note) => n.id === note.id));
	});
});
