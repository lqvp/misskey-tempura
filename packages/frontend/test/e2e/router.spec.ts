/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test, expect } from './fixtures.js';
import {
	// const
	BASE_URL,
	// utils
	resetState, registerUser,
	// page utils
	signIn, closeUserSetupDialogIfVisible,
} from './utils.js';

test.describe('Router transition', () => {
	test.beforeAll(async () => {
		await resetState();
		await registerUser('admin', 'pass', true);
		await registerUser('alice', 'alice1234');
	});

	test.beforeEach(async ({ page }) => {
		await signIn(page, 'alice', 'alice1234');

		// 表示に時間がかかるのでデフォルト秒数だとタイムアウトする。少し待つ
		await page.waitForTimeout(1000);

		await closeUserSetupDialogIfVisible(page);
	});

	test.describe('Redirect', () => {
		test('redirect to user profile', async ({ page }) => {
			const accountId = new URL(page.url()).searchParams.get('as');
			expect(accountId).toBeTruthy();

			await page.goto(`${BASE_URL}/redirect-test`);
			await page.waitForURL((url) => url.pathname === '/@alice');
			expect(new URL(page.url()).searchParams.get('as')).toBe(accountId);
		});
	});
});
