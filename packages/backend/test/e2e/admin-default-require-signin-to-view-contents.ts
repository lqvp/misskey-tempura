/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { api, post, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

// インスタンス設定 defaultRequireSigninToViewContents が
// admin/meta に公開され、admin/update-meta で往復でき、
// 新規アカウントにのみ既定値として適用されることを実サーバーで確認する。
//
// 注意: UserEntityService は requireSigninToViewContents === false を undefined として
// パックする（キー自体が落ちる）ため、signup のレスポンスからは
// 「既定値 false が保存された」ことを観測できない。
// 既定値が実際に効いているかは、未認証でノートが読めるかという振る舞いで検証する。
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

	// 未認証訪問者から当該ユーザーのノートが見えるかを、実際の API 経路で確認する。
	// notes/show は作者の requireSigninToViewContents が true なら
	// contentRestrictedByUser エラー（クライアントエラー = 400）を返す。
	async function createNoteAndProbeAnonymously(user: Record<string, unknown>): Promise<{ status: number, code: string | undefined }> {
		const note = await post({ token: user.token as string }, { text: 'reqsignin visibility probe' });
		const res = await api('notes/show', { noteId: note.id });
		const body = res.body as { error?: { code?: string } } | null;
		return { status: res.status, code: body?.error?.code };
	}

	beforeAll(async () => {
		admin = await signup({ username: 'admin_reqsignin' });
		const meta = await getMeta();
		assert.ok('defaultRequireSigninToViewContents' in meta, 'admin/meta に設定が公開されているべき');
		// 復元情報を先に確保してから型を assert する（後段の assert が落ちても復元できるように）
		original = meta.defaultRequireSigninToViewContents as boolean;
		assert.strictEqual(typeof original, 'boolean', '設定は boolean であるべき');
	}, 1000 * 60 * 2);

	afterAll(async () => {
		if (admin == null || original == null) return;
		const res = await api('admin/update-meta', { defaultRequireSigninToViewContents: original }, admin);
		assert.strictEqual(res.status, 204, '設定の復元に失敗');
	});

	test('true にすると新規アカウントで有効になり、未認証からノートが見えなくなる', async () => {
		await setDefault(true);
		assert.strictEqual((await getMeta()).defaultRequireSigninToViewContents, true);

		const created = await signupRaw('reqsignin_on');
		assert.strictEqual(created.requireSigninToViewContents, true);
		const probe = await createNoteAndProbeAnonymously(created);
		assert.strictEqual(probe.code, 'CONTENT_RESTRICTED_BY_USER', '既定 true のアカウントのノートは未認証では見えないべき');
	});

	test('false にすると新規アカウントで無効になり、未認証からノートが見える', async () => {
		await setDefault(false);
		assert.strictEqual((await getMeta()).defaultRequireSigninToViewContents, false);

		const created = await signupRaw('reqsignin_off');
		// pack の仕様上、false はキーの不在として現れる
		assert.strictEqual('requireSigninToViewContents' in created, false);
		// 既定値 false が実際に保存されたことは、未認証からノートが読めることで検証する。
		// 実装が外れて requireSigninToViewContents が true になれば 404 となりこの assert が落ちる。
		const probe = await createNoteAndProbeAnonymously(created);
		assert.strictEqual(probe.status, 200, '既定 false のアカウントのノートは未認証で見えるべき');
	});

	test('true から false に戻した後のサインアップは無効になる', async () => {
		// 設定を戻したときにキャッシュが古いまま残らないことを確認する
		await setDefault(true);
		const on = await signupRaw('reqsignin_toggle_on');
		assert.strictEqual(on.requireSigninToViewContents, true);

		await setDefault(false);
		const off = await signupRaw('reqsignin_toggle_off');
		assert.strictEqual('requireSigninToViewContents' in off, false);
		assert.strictEqual((await createNoteAndProbeAnonymously(off)).status, 200);
	});

	test('設定を変更しても既存アカウントの値は変わらない', async () => {
		await setDefault(false);
		const existing = await signupRaw('reqsignin_existing');
		assert.strictEqual((await createNoteAndProbeAnonymously(existing)).status, 200);

		await setDefault(true);

		// 既存アカウントは既定値変更の影響を受けない（未認証から引き続き読める）
		const res = await api('i', {}, { token: existing.token as string });
		assert.strictEqual(res.status, 200);
		assert.strictEqual((await createNoteAndProbeAnonymously(existing)).status, 200, '既存アカウントの可視性は変わらないべき');
	});

	test('管理者が作成したアカウントにも既定値が適用される', async () => {
		// admin/accounts/create も SignupService を通る第4のローカルユーザー作成経路
		await setDefault(true);

		const res = await api('admin/accounts/create', { username: 'reqsignin_admin', password: 'test' }, admin);
		assert.strictEqual(res.status, 200);
		assert.strictEqual((res.body as Record<string, unknown>).requireSigninToViewContents, true);
	});
});
