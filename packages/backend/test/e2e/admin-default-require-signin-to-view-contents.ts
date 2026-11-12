/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { api, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

// 管理者がインスタンス設定で「新規アカウントのコンテンツ表示にログインを必須にする」の
// 既定値を切り替えられること、およびその既定値が新規サインアップにのみ適用され、
// 既存アカウントの設定を書き換えないことを実サーバーで確認する。
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

	// テスト用の signup ヘルパーは requireSigninToViewContents を強制的に無効化するため、
	// 既定値の検証には素の signup エンドポイントを使う
	async function signupRaw(username: string): Promise<misskey.entities.SignupResponse> {
		const res = await api('signup', { username, password: 'test' });
		assert.strictEqual(res.status, 200);
		return res.body as misskey.entities.SignupResponse;
	}

	beforeAll(async () => {
		admin = await signup({ username: 'admin_reqsignin' });
		const meta = await getMeta();
		assert.ok('defaultRequireSigninToViewContents' in meta, 'admin/meta に設定が公開されているべき');
		assert.strictEqual(typeof meta.defaultRequireSigninToViewContents, 'boolean', '設定は boolean であるべき');
		original = meta.defaultRequireSigninToViewContents as boolean;
	}, 1000 * 60 * 2);

	afterAll(async () => {
		// beforeAll が失敗した場合は復元する値が無い
		if (admin == null) return;
		// 後続のテストファイルに影響しないよう、元の値に戻す
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
		assert.notStrictEqual(created.requireSigninToViewContents, true);
	});

	test('設定を変更しても既存アカウントの値は変わらない', async () => {
		await setDefault(false);
		const existing = await signupRaw('reqsignin_existing');
		assert.notStrictEqual(existing.requireSigninToViewContents, true);

		await setDefault(true);

		const res = await api('i', {}, { token: existing.token });
		assert.strictEqual(res.status, 200);
		assert.notStrictEqual((res.body as { requireSigninToViewContents?: boolean }).requireSigninToViewContents, true);
	});
});
