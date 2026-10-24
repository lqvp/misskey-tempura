/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { beforeAll, describe, test } from 'vitest';
import { api, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

// ugcVisibilityForVisitor === 'none' のとき、匿名(未ログイン)の users/show は
// noSuchUser で拒否され、ログイン済みユーザーは影響を受けないこと。
// (以前はログイン時も拒否してしまうバグでコメントアウトされていた)
describe('users/show ugcVisibilityForVisitor none', () => {
	let admin: misskey.entities.SignupResponse;

	beforeAll(async () => {
		// 最初のサインアップユーザーは管理者になる
		admin = await signup({ username: 'admin_ugc' });
	}, 1000 * 60 * 2);

	test('none 設定中は匿名の users/show が noSuchUser になる', async () => {
		await api('admin/update-meta', { ugcVisibilityForVisitor: 'none' }, admin);
		const res = await api('users/show', { username: 'admin_ugc' });
		assert.notStrictEqual(res.status, 200);
		assert.strictEqual((res.body as any).error.code, 'NO_SUCH_USER');
	});

	test('none 設定中でもログイン済みなら取得できる', async () => {
		const res = await api('users/show', { username: 'admin_ugc' }, admin);
		assert.strictEqual(res.status, 200);
		assert.strictEqual(res.body.username, 'admin_ugc');
	});

	test('all に戻すと匿名でも取得できる', async () => {
		await api('admin/update-meta', { ugcVisibilityForVisitor: 'all' }, admin);
		const res = await api('users/show', { username: 'admin_ugc' });
		assert.strictEqual(res.status, 200);
		assert.strictEqual(res.body.username, 'admin_ugc');
	});
});
