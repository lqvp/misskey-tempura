/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test } from './fixtures.js';
import {
	// const
	ADMIN_SETUP_PASSWORD, BASE_URL, assertOk,
	// locator helper
	locateMkInput, locateMkSwitch, locateMkTextarea,
	// utils
	acceptInvitationCode, createInvitationCode, registerUser, resetState, visitHome, closeUserSetupDialog, postNote,
	// page utils
	waitApiResponse, signIn,
} from './utils.js';
import type { RegisteredUser } from './utils.js';

test.describe('Before setup instance', () => {
	test.beforeEach(async ({ request }) => {
		await resetState();
	});

	test('successfully loads', async ({ page }) => {
		await visitHome(page);
	});

	test('setup instance', async ({ page }) => {
		await visitHome(page);

		await locateMkInput(page, 'admin-initial-password').fill(ADMIN_SETUP_PASSWORD);
		await locateMkInput(page, 'admin-username').fill('admin');
		await locateMkInput(page, 'admin-password').fill('admin1234');

		const signupResponse = waitApiResponse(page, '/api/admin/accounts/create');
		await page.getByTestId('admin-ok').click();
		assertOk((await signupResponse).status(), '/api/admin/accounts/create');

		await page.getByTestId('next').click();
		await locateMkInput(page, 'server-setup-server-name').fill('Testskey');
		const updateMetaResponse = waitApiResponse(page, '/api/admin/update-meta');
		await page.getByTestId('server-setup-wizard-apply').click();
		assertOk((await updateMetaResponse).status(), '/api/admin/update-meta');
	});
});

test.describe('After setup instance', () => {
	let admin: RegisteredUser;

	test.beforeEach(async () => {
		await resetState();
		admin = await registerUser('admin', 'pass', true);
	});

	test('successfully loads', async ({ page }) => {
		await visitHome(page);
	});

	test('signup', async ({ page }) => {
		const invitationCode = await createInvitationCode(admin.token);
		await visitHome(page);

		await page.getByTestId('signup').click();
		await page.getByTestId('signup-rules-continue').waitFor({ state: 'visible' });
		test.expect(await page.getByTestId('signup-rules-continue').isDisabled()).toBeTruthy();

		await locateMkSwitch(page, 'signup-rules-notes-agree').click();
		await page.getByTestId('modal-dialog-ok').click();
		await page.getByTestId('signup-rules-continue').click();
		await acceptInvitationCode(page, invitationCode);

		const signupSubmit = page.getByTestId('signup-submit');
		await test.expect(signupSubmit).toBeDisabled();
		await locateMkInput(page, 'signup-username').fill('alice');
		await locateMkInput(page, 'signup-password').fill('alice1234');
		await locateMkInput(page, 'signup-password-retype').fill('alice1234');
		await test.expect(locateMkInput(page, 'signup-invitation-code')).toHaveValue(invitationCode);
		await test.expect(signupSubmit).toBeEnabled();

		const signupResponse = waitApiResponse(page, '/api/signup');
		await page.getByTestId('signup-submit').click();
		const response = await signupResponse;
		assertOk(response.status(), '/api/signup');

		const createdUser = await response.json() as { id?: unknown; token?: unknown; username?: unknown };
		test.expect(typeof createdUser.id).toBe('string');
		test.expect(typeof createdUser.token).toBe('string');
		const userResponse = await page.request.post(`${BASE_URL}/api/users/show`, {
			data: {
				i: admin.token,
				userId: createdUser.id,
			},
		});
		assertOk(userResponse.status(), '/api/users/show');
		const user = await userResponse.json() as { username?: unknown };
		test.expect(user.username).toBe('alice');
	});

	test('signup with duplicated username', async ({ page }) => {
		const invitationCode = await createInvitationCode(admin.token);
		await registerUser('alice', 'alice1234');
		await visitHome(page);

		await page.getByTestId('signup').click();
		await page.getByTestId('signup-rules-continue').waitFor({ state: 'visible' });
		test.expect(await page.getByTestId('signup-rules-continue').isDisabled()).toBeTruthy();

		await locateMkSwitch(page, 'signup-rules-notes-agree').click();
		await page.getByTestId('modal-dialog-ok').click();
		test.expect(await page.getByTestId('signup-rules-continue').isDisabled()).toBeFalsy();
		await page.getByTestId('signup-rules-continue').click();
		await acceptInvitationCode(page, invitationCode);

		await locateMkInput(page, 'signup-username').fill('alice');
		await locateMkInput(page, 'signup-password').fill('alice1234');
		await locateMkInput(page, 'signup-password-retype').fill('alice1234');
		await test.expect(page.getByTestId('signup-submit')).toBeDisabled();
	});
});

test.describe('After user signup', () => {
	let admin: RegisteredUser;
	let alice: RegisteredUser;

	test.beforeEach(async () => {
		await resetState();
		admin = await registerUser('admin', 'pass', true);
		alice = await registerUser('alice', 'alice1234');
	});

	test('successfully loads', async ({ page }) => {
		await visitHome(page);
	});

	test('signin', async ({ page }) => {
		await visitHome(page);

		await page.getByTestId('signin').click();

		await page.getByTestId('signin-page-input').waitFor({ state: 'visible', timeout: 10000 });
		await locateMkInput(page, 'signin-username').fill('alice');
		// Enterキーで続行できるかどうかの確認も兼ねる
		await page.keyboard.press('Enter');

		await page.getByTestId('signin-page-password').waitFor({ state: 'visible', timeout: 10000 });
		await locateMkInput(page, 'signin-password').fill('alice1234');

		const signinResponse = waitApiResponse(page, '/api/signin-flow');
		// Enterキーで続行できるかどうかの確認も兼ねる
		await page.keyboard.press('Enter');
		const response = await signinResponse;
		assertOk(response.status(), '/api/signin-flow');
		const result = await response.json() as { finished?: unknown; id?: unknown; i?: unknown } | null;
		if (!result || result.finished !== true || typeof result.id !== 'string' || typeof result.i !== 'string') {
			throw new Error('/api/signin-flow returned an incomplete sign-in response');
		}
	});

	test('suspend', async ({ page }) => {
		const suspendResponse = await page.request.post(`${BASE_URL}/api/admin/suspend-user`, {
			data: {
				i: admin.token,
				userId: alice.id,
			},
		});
		assertOk(suspendResponse.status(), '/api/admin/suspend-user');

		await visitHome(page);

		await page.getByTestId('signin').click();

		await page.getByTestId('signin-page-input').waitFor({ state: 'visible', timeout: 10000 });
		await locateMkInput(page, 'signin-username').fill('alice');
		await page.keyboard.press('Enter');

		await page.getByTestId('modal-dialog-ok').waitFor({ state: 'visible', timeout: 10000 });
	});
});

test.describe('After user signed in', () => {
	test.beforeEach(async ({ page }) => {
		await resetState();
		await registerUser('admin', 'pass', true);
		await registerUser('alice', 'alice1234');
		await signIn(page, 'alice', 'alice1234');
	});

	test('successfully loads', async ({ page }) => {
		// 表示に時間がかかるのでデフォルト秒数だとタイムアウトする
		await page.getByTestId('user-setup-continue').waitFor({ state: 'visible', timeout: 30000 });
	});

	test('account setup wizard', async ({ page }) => {
		// 表示に時間がかかるのでデフォルト秒数だとタイムアウトする
		await page.getByTestId('user-setup-continue').click({ timeout: 30000 });

		await locateMkInput(page, 'user-setup-user-name').fill('ありす');
		await locateMkTextarea(page, 'user-setup-user-description').fill('ほげ');
		// TODO: アイコン設定のテスト
		await page.getByTestId('user-setup-continue').click();

		// プライバシー設定
		await page.getByTestId('user-setup-continue').click();

		// フォロー設定
		await page.getByTestId('user-setup-continue').click();

		// プッシュ通知設定
		await page.getByTestId('user-setup-continue').click();

		// 完了
		await page.getByTestId('user-setup-continue').click();
	});
});

test.describe('After user setup', () => {
	test.beforeEach(async ({ page }) => {
		await resetState();
		await registerUser('admin', 'pass', true);
		await registerUser('alice', 'alice1234');
		await signIn(page, 'alice', 'alice1234');

		await closeUserSetupDialog(page);
	});

	test('note', async ({ page }) => {
		await postNote(page, 'Hello, Misskey!');
	});

	test('open note form with hotkey', async ({ page }) => {
		await page.getByTestId('open-post-form').waitFor({ state: 'visible' });
		await page.keyboard.press('KeyN');
		await page.getByTestId('post-form-text').waitFor({ state: 'visible' });
		await page.keyboard.press('Escape');
		await page.getByTestId('post-form-text').waitFor({ state: 'hidden' });
	});
});

// TODO: 投稿フォームの公開範囲指定のテスト
// TODO: 投稿フォームのファイル添付のテスト
// TODO: 投稿フォームのハッシュタグ保持フィールドのテスト
