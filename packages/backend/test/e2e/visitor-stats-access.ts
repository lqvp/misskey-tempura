/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { beforeAll, describe, test } from 'vitest';
import { MiUser } from '@/models/_.js';
import { api, initTestDb, post, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

// 統計系エンドポイント(stats, get-online-users-count, charts/*)の匿名アクセスは
// サーバー設定の個別フラグ(既定 off)で制御されること。
// off の間は従来通りゼロ埋め/空の応答、on にすると匿名でも実データを返す。
describe('visitor stats access switches', () => {
	let admin: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;

	beforeAll(async () => {
		const db = await initTestDb(true);
		// 最初のサインアップユーザーは管理者になる
		admin = await signup({ username: 'admin_stats' });
		bob = await signup({ username: 'bob_stats' });
		// stats の reactionsCount は実テーブルの件数なので1件リアクションを付ける
		// (notesCount/usersCount はチャートデーモン依存のため e2e では増えない)
		const note = await post(admin, { text: 'stats access target' });
		await api('notes/reactions/create', { noteId: note.id, reaction: '❤️' }, bob);
		// オンライン数(lastActiveDate 直近)を e2e で再現するため直接更新する
		await db.getRepository(MiUser).update({ id: admin.id }, { lastActiveDate: new Date() });
		await db.destroy();
	}, 1000 * 60 * 2);

	test('匿名は stats のフラグが off の間ゼロ埋め応答', async () => {
		const res = await api('stats', {});
		assert.strictEqual(res.status, 200);
		assert.strictEqual(res.body.notesCount, 0);
		assert.strictEqual(res.body.usersCount, 0);
	});

	test('フラグを on にすると匿名でも stats の実データを返す', async () => {
		const um1 = await api('admin/update-meta', { allowAnonymousStats: true }, admin);
		assert.strictEqual(um1.status, 204, `update-meta(on) failed: ${JSON.stringify(um1.body)}`);
		const meta1 = await api('admin/meta', {}, admin);
		assert.strictEqual(meta1.body.allowAnonymousStats, true, 'admin/meta must reflect on');
		const res = await api('stats', {});
		assert.strictEqual(res.status, 200);
		assert.ok(res.body.reactionsCount >= 1, 'real stats must include the reaction row count');
		const um2 = await api('admin/update-meta', { allowAnonymousStats: false }, admin);
		assert.strictEqual(um2.status, 204, `update-meta(off) failed: ${JSON.stringify(um2.body)}`);
		const meta2 = await api('admin/meta', {}, admin);
		const res2 = await api('stats', {});
		assert.strictEqual(res2.body.reactionsCount, 0,
			`flag in admin/meta=${meta2.body.allowAnonymousStats}, res2=${JSON.stringify(res2.body)}`);
	});

	test('匿名は get-online-users-count のフラグが off の間 0', async () => {
		const meta0 = await api('admin/meta', {}, admin);
		const res = await api('get-online-users-count', {});
		assert.strictEqual(res.status, 200);
		assert.strictEqual(res.body.count, 0,
			`flag in admin/meta=${meta0.body.allowAnonymousOnlineUsersCount}, res=${JSON.stringify(res.body)}`);
	});

	test('フラグを on にすると匿名でもオンライン数を返す', async () => {
		await api('admin/update-meta', { allowAnonymousOnlineUsersCount: true }, admin);
		const res = await api('get-online-users-count', {});
		assert.strictEqual(res.status, 200);
		assert.ok(res.body.count >= 1);
		await api('admin/update-meta', { allowAnonymousOnlineUsersCount: false }, admin);
	});

	test('匿名は charts/notes のフラグが off の間空のチャート', async () => {
		const res = await api('charts/notes', { span: 'day', limit: 1 }, undefined);
		assert.strictEqual(res.status, 200);
		assert.deepStrictEqual(res.body.local.inc, []);
	});

	test('フラグを on にすると匿名でも charts/notes を返す', async () => {
		await api('admin/update-meta', { allowAnonymousChartNotes: true }, admin);
		const res = await api('charts/notes', { span: 'day', limit: 1 }, undefined);
		assert.strictEqual(res.status, 200);
		assert.ok(Array.isArray(res.body.local.inc) && res.body.local.inc.length === 1);
		await api('admin/update-meta', { allowAnonymousChartNotes: false }, admin);
	});

	test('他のチャートのフラグは独立(charts/users を on にしても charts/notes は遮断のまま)', async () => {
		await api('admin/update-meta', { allowAnonymousChartUsers: true }, admin);
		const notesRes = await api('charts/notes', { span: 'day', limit: 1 }, undefined);
		assert.deepStrictEqual(notesRes.body.local.inc, []);
		await api('admin/update-meta', { allowAnonymousChartUsers: false }, admin);
	});

	test('ログイン済みユーザーはフラグに関係なく取得できる', async () => {
		const res = await api('stats', {}, admin);
		assert.strictEqual(res.status, 200);
		assert.ok(res.body.reactionsCount >= 1);
	});
});
