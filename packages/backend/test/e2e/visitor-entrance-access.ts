/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { Redis } from 'ioredis';
import { beforeAll, describe, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { MiInstance } from '@/models/_.js';
import { api, initTestDb, post, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

// federation/instances と notes/featured の匿名アクセスは、entrance 系設定から
// 分離された個別フラグ(初期値は migration が entrance の現行値をコピー)で制御されること。
describe('visitor entrance access separation', () => {
	let admin: misskey.entities.SignupResponse;
	let note: misskey.entities.Note;

	const REMOTE_HOST = 'entrance-remote.example';

	beforeAll(async () => {
		const db = await initTestDb(true);
		// 最初のサインアップユーザーは管理者になる
		admin = await signup({ username: 'admin_entrance' });

		note = await post(admin, { text: 'entrance access target' });
		// featured のランキングはリアクション駆動かつ確率更新のため、
		// 決定的にするためランキング(Redis)に直接登録する
		const redis = new Redis(loadConfig().redis);
		const featuredWindow = Math.floor(
			(Date.now() - new Date('2023-01-01T00:00:00Z').getTime()) / (1000 * 60 * 60 * 24 * 3));
		await redis.zadd(`featuredGlobalNotesRanking:${featuredWindow}`, 1, note.id);
		redis.disconnect();
		await db.getRepository(MiInstance).insert({
			id: 'entranceremote01',
			firstRetrievedAt: new Date(),
			host: REMOTE_HOST,
			usersCount: 1,
		});
		await db.destroy();

		// 既定(どちらの entrance も false)では匿名はどちらも取得できない
		const inst = await api('federation/instances', {});
		assert.deepStrictEqual(inst.body, []);
		const feat = await api('notes/featured', {});
		assert.deepStrictEqual(feat.body, []);
	}, 1000 * 60 * 2);

	test('allowAnonymousFederationInstances を on にすると匿名でも federation/instances を返す', async () => {
		await api('admin/update-meta', { allowAnonymousFederationInstances: true }, admin);
		const res = await api('federation/instances', {});
		assert.strictEqual(res.status, 200);
		assert.ok(Array.isArray(res.body) && res.body.some((x: misskey.entities.FederationInstance) => x.host === REMOTE_HOST));
		await api('admin/update-meta', { allowAnonymousFederationInstances: false }, admin);
		const res2 = await api('federation/instances', {});
		assert.deepStrictEqual(res2.body, []);
	});

	test('entranceShowFederation を変えても federation/instances の匿名応答は追従しない(分離)', async () => {
		await api('admin/update-meta', { entranceShowFederation: true }, admin);
		const res = await api('federation/instances', {});
		assert.deepStrictEqual(res.body, []);
		await api('admin/update-meta', { entranceShowFederation: false }, admin);
	});

	test('allowAnonymousFeatured を on にすると匿名でも featured を返す', async () => {
		await api('admin/update-meta', { allowAnonymousFeatured: true }, admin);
		const res = await api('notes/featured', {});
		assert.strictEqual(res.status, 200);
		assert.ok(Array.isArray(res.body) && res.body.some((x: misskey.entities.Note) => x.id === note.id));
		await api('admin/update-meta', { allowAnonymousFeatured: false }, admin);
		const res2 = await api('notes/featured', {});
		assert.deepStrictEqual(res2.body, []);
	});

	test('entranceShowFeatured を変えても featured の匿名応答は追従しない(分離)', async () => {
		await api('admin/update-meta', { entranceShowFeatured: true }, admin);
		const res = await api('notes/featured', {});
		assert.deepStrictEqual(res.body, []);
		await api('admin/update-meta', { entranceShowFeatured: false }, admin);
	});

	test('ログイン済みユーザーはフラグに関係なく取得できる', async () => {
		const res = await api('federation/instances', {}, admin);
		assert.strictEqual(res.status, 200);
		assert.ok(Array.isArray(res.body) && res.body.some((x: misskey.entities.FederationInstance) => x.host === REMOTE_HOST));
	});
});
