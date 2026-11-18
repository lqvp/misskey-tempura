/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { api, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

// インスタンス設定 defaultRequireSigninToViewContents が
// admin/meta に公開され、admin/update-meta で往復でき、
// 新規アカウントにのみ既定値として適用されることを実サーバーで確認する。
describe('defaultRequireSigninToViewContents', () => {
	let admin: misskey.entities.SignupResponse;
	let original: boolean;

	async function getMeta(): Promise<Record<string, unknown>> {
		const res = await api('admin/meta', {}, admin);
		assert.strictEqual(res.status, 200);
		return res.body as unknown as Record<string, unknown>;
	}

	async function setDefault(value: boolean): Promise<void> {
		const res = await api('admin/update-meta', { defaultRequireSigninToViewContents: value }, admin);
		assert.strictEqual(res.status, 204);
	}

	// utils.ts の signup() ヘルパーはサインアップ直後に i/update で
	// requireSigninToViewContents を強制的に false にするため、
	// インスタンス既定値そのものを観測できない。素の signup を使う。
	async function signupRaw(username: string): Promise<Record<string, unknown>> {
		const res = await api('signup', { username, password: 'test' });
		assert.strictEqual(res.status, 200);
		return res.body as unknown as Record<string, unknown>;
	}

	beforeAll(async () => {
		admin = await signup({ username: 'admin_reqsignin' });
		const meta = await getMeta();
		assert.ok('defaultRequireSigninToViewContents' in meta, 'admin/meta に設定が公開されているべき');
		assert.strictEqual(typeof meta.defaultRequireSigninToViewContents, 'boolean', '設定は boolean であるべき');
		original = meta.defaultRequireSigninToViewContents as boolean;
	}, 1000 * 60 * 2);

	afterAll(async () => {
		// beforeAll が失敗した場合、admin は非nullでも original が未設定になりうる。
		// 未設定のまま update-meta を呼ぶと undefined は無視され、復元が無言で失敗する。
		if (admin == null || original == null) return;
		await api('admin/update-meta', { defaultRequireSigninToViewContents: original }, admin);
	});

	test('true にすると新規アカウントで有効になる', async () => {
		await setDefault(true);
		assert.strictEqual((await getMeta()).defaultRequireSigninToViewContents, true);

		const created = await signupRaw('reqsignin_on');
		assert.strictEqual(created.requireSigninToViewContents, true);
	});

	test('false にすると新規アカウントで無効になる', async () => {
		await setDefault(false);
		assert.strictEqual((await getMeta()).defaultRequireSigninToViewContents, false);

		const created = await signupRaw('reqsignin_off');
		// UserEntityService は requireSigninToViewContents === false を undefined としてパックするため、
		// レスポンスにはキー自体が存在しない。false との同一性比較は失敗する。
		assert.strictEqual('requireSigninToViewContents' in created, false);
	});

	test('設定を変更しても既存アカウントの値は変わらない', async () => {
		await setDefault(false);
		const existing = await signupRaw('reqsignin_existing');
		assert.strictEqual('requireSigninToViewContents' in existing, false);

		await setDefault(true);

		const res = await api('i', {}, { token: existing.token as string });
		assert.strictEqual(res.status, 200);
		assert.notStrictEqual((res.body as Record<string, unknown>).requireSigninToViewContents, true);
	});

	test('管理者が作成したアカウントにも既定値が適用される', async () => {
		// admin/accounts/create も SignupService を通る第4のローカルユーザー作成経路。
		// 既定値の適用漏れがないことを確認する。
		await setDefault(true);

		const res = await api('admin/accounts/create', { username: 'reqsignin_admin', password: 'test' }, admin);
		assert.strictEqual(res.status, 200);
		assert.strictEqual((res.body as Record<string, unknown>).requireSigninToViewContents, true);
	});
});
