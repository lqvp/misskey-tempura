/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { beforeAll, describe, test } from 'vitest';
import { MiFollowing, MiInstance, MiUser, MiUserProfile } from '@/models/_.js';
import { api, initTestDb, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

// 配送先エディタ用のフォロワーのサーバー一覧。
// ローカルに保存済みのインスタンス情報(名前・アイコン)を返し、無い場合は null になること。
describe('i/followers-servers', () => {
	let alice: misskey.entities.SignupResponse;

	const NAMED_HOST = 'fsnamed.example';
	const BARE_HOST = 'fsbare.example';

	beforeAll(async () => {
		const db = await initTestDb(true);
		alice = await signup({ username: 'fsalice' });

		await db.getRepository(MiInstance).insert({
			id: 'fsinst000000001',
			firstRetrievedAt: new Date(),
			host: NAMED_HOST,
			name: 'Named Server',
			faviconUrl: `https://${NAMED_HOST}/favicon.ico`,
			iconUrl: null,
		});

		// BARE_HOST はインスタンス情報を持たない(未取得)
		for (const [i, host] of [NAMED_HOST, NAMED_HOST, BARE_HOST].entries()) {
			const userId = `fsremoteuser00${i}`;
			await db.getRepository(MiUser).insert({
				id: userId,
				username: `fsremote${i}`,
				usernameLower: `fsremote${i}`,
				host,
				uri: `https://${host}/users/fsremote${i}`,
				inbox: `https://${host}/users/fsremote${i}/inbox`,
				sharedInbox: `https://${host}/inbox`,
			});
			await db.getRepository(MiUserProfile).insert({ userId });
			await db.getRepository(MiFollowing).insert({
				id: `fsfollowing0000${i}`,
				followeeId: alice.id,
				followerId: userId,
				followerHost: host,
				followerInbox: `https://${host}/users/fsremote${i}/inbox`,
				followerSharedInbox: `https://${host}/inbox`,
			});
		}
		await db.destroy();
	}, 1000 * 60 * 2);

	test('サーバーごとのフォロワー数に、保存済みの名前とアイコンURLを添えて返す', async () => {
		const res = await api('i/followers-servers', {}, alice);
		assert.strictEqual(res.status, 200);
		const named = res.body.servers.find((s: { host: string }) => s.host === NAMED_HOST);
		assert.deepStrictEqual(named, {
			host: NAMED_HOST,
			followersCount: 2,
			name: 'Named Server',
			iconUrl: null,
			faviconUrl: `https://${NAMED_HOST}/favicon.ico`,
		});
	});

	test('インスタンス情報が未取得のサーバーは名前とアイコンが null', async () => {
		const res = await api('i/followers-servers', {}, alice);
		const bare = res.body.servers.find((s: { host: string }) => s.host === BARE_HOST);
		assert.deepStrictEqual(bare, {
			host: BARE_HOST,
			followersCount: 1,
			name: null,
			iconUrl: null,
			faviconUrl: null,
		});
	});

	test('認証なしでは使えない', async () => {
		const res = await api('i/followers-servers', {});
		assert.strictEqual(res.status, 401);
	});
});
