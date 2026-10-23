/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { afterEach, beforeAll, describe, test } from 'vitest';
import { MiInstance, MiUser, MiUserProfile } from '@/models/_.js';
import { api, initTestDb, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

// 連合系エンドポイント(federation/users, federation/stats, federation/show-instance)の匿名アクセスは
// サーバー設定の個別フラグ(既定 off)で制御されること。
// off の間は従来通り空/ゼロ埋めの応答、on にすると匿名でも実データを返す。
// 実データが空だとフラグの on/off を区別できないため、リモートのインスタンスとユーザーをDBに直接登録する。
describe('visitor federation access switches', () => {
	let admin: misskey.entities.SignupResponse;

	const REMOTE_HOST = 'fedremote.example';

	// 途中のテスト失敗でフラグが on のまま残って後続テストに波及しないよう毎回戻す
	afterEach(async () => {
		await api('admin/update-meta', {
			allowAnonymousFederationUsers: false,
			allowAnonymousShowInstance: false,
		}, admin);
	});

	beforeAll(async () => {
		const db = await initTestDb(true);
		// 最初のサインアップユーザーは管理者になる
		admin = await signup({ username: 'admin_fed' });

		await db.getRepository(MiInstance).insert({
			id: 'fedremotinst0001',
			firstRetrievedAt: new Date(),
			host: REMOTE_HOST,
			usersCount: 1,
			followersCount: 1,
		});
		await db.getRepository(MiUser).insert({
			id: 'fedremoteuser0001',
			username: 'fedremote',
			usernameLower: 'fedremote',
			host: REMOTE_HOST,
			uri: `https://${REMOTE_HOST}/users/fedremote`,
			inbox: `https://${REMOTE_HOST}/users/fedremote/inbox`,
			sharedInbox: `https://${REMOTE_HOST}/inbox`,
		});
		// pack(UserDetailedNotMe) がプロフィールを参照するため併せて登録する
		await db.getRepository(MiUserProfile).insert({
			userId: 'fedremoteuser0001',
		});
		await db.destroy();
	}, 1000 * 60 * 2);

	test('匿名は federation/users のフラグが off の間空の応答', async () => {
		const res = await api('federation/users', { host: REMOTE_HOST });
		assert.strictEqual(res.status, 200);
		assert.deepStrictEqual(res.body, []);
	});

	test('フラグを on にすると匿名でも federation/users を返す', async () => {
		await api('admin/update-meta', { allowAnonymousFederationUsers: true }, admin);
		const res = await api('federation/users', { host: REMOTE_HOST });
		assert.strictEqual(res.status, 200);
		assert.ok(Array.isArray(res.body) && res.body.length === 1);
		assert.strictEqual(res.body[0].username, 'fedremote');
		await api('admin/update-meta', { allowAnonymousFederationUsers: false }, admin);
		const res2 = await api('federation/users', { host: REMOTE_HOST });
		assert.deepStrictEqual(res2.body, []);
	});

	test('ugcVisibilityForVisitor=none の間はフラグ on でも匿名には federation/users を返さない', async () => {
		await api('admin/update-meta', { allowAnonymousFederationUsers: true, ugcVisibilityForVisitor: 'none' }, admin);
		try {
			const res = await api('federation/users', { host: REMOTE_HOST });
			assert.strictEqual(res.status, 200);
			assert.deepStrictEqual(res.body, []);
			// ログイン済みは visitor ポリシーの影響を受けない
			const res2 = await api('federation/users', { host: REMOTE_HOST }, admin);
			assert.strictEqual(res2.status, 200);
			assert.strictEqual(res2.body.length, 1);
		} finally {
			await api('admin/update-meta', { ugcVisibilityForVisitor: 'all' }, admin);
		}
	});

	test('匿名は federation/show-instance のフラグが off の間 null', async () => {
		// null 応答は 204 (No Content) として返る
		const res = await api('federation/show-instance', { host: REMOTE_HOST });
		assert.strictEqual(res.status, 204);
		assert.ok(res.body == null);
	});

	test('フラグを on にすると匿名でも federation/show-instance を返す', async () => {
		await api('admin/update-meta', { allowAnonymousShowInstance: true }, admin);
		const res = await api('federation/show-instance', { host: REMOTE_HOST });
		assert.strictEqual(res.status, 200);
		assert.ok(res.body);
		assert.strictEqual(res.body.host, REMOTE_HOST);
		await api('admin/update-meta', { allowAnonymousShowInstance: false }, admin);
	});

	test('匿名は federation/stats のフラグが off の間ゼロ埋め応答', async () => {
		const res = await api('federation/stats', {});
		assert.strictEqual(res.status, 200);
		assert.deepStrictEqual(res.body.topSubInstances, []);
		assert.strictEqual(res.body.otherFollowersCount, 0);
	});

	test('フラグを on にすると匿名でも federation/stats を返す', async () => {
		await api('admin/update-meta', { allowAnonymousFederationStats: true }, admin);
		const res = await api('federation/stats', {});
		assert.strictEqual(res.status, 200);
		assert.ok(Array.isArray(res.body.topSubInstances) && res.body.topSubInstances.length === 1);
		assert.strictEqual(res.body.topSubInstances[0].host, REMOTE_HOST);
		await api('admin/update-meta', { allowAnonymousFederationStats: false }, admin);
	});

	test('フラグは独立(show-instance を on にしても users は遮断のまま)', async () => {
		await api('admin/update-meta', { allowAnonymousShowInstance: true }, admin);
		const usersRes = await api('federation/users', { host: REMOTE_HOST });
		assert.deepStrictEqual(usersRes.body, []);
		await api('admin/update-meta', { allowAnonymousShowInstance: false }, admin);
	});

	test('ログイン済みユーザーはフラグに関係なく取得できる', async () => {
		const res = await api('federation/users', { host: REMOTE_HOST }, admin);
		assert.strictEqual(res.status, 200);
		assert.ok(Array.isArray(res.body) && res.body.length === 1);
	});
});
