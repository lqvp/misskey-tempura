/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { directives } from '@/directives/index.js';
import { components } from '@/components/index.js';
import locales from 'i18n';
import { updateI18n } from '@/i18n.js';
import MkSignin from '@/components/MkSignin.vue';

const { apiMock } = vi.hoisted(() => {
	return {
		apiMock: vi.fn((_endpoint: string, _payload?: Record<string, unknown>) => Promise.resolve({})),
	};
});

vi.mock('@/utility/misskey-api.js', async (importOriginal) => ({
	...(await importOriginal() as Record<string, unknown>),
	misskeyApi: apiMock,
}));

// ugcVisibilityForVisitor = 'none' のとき、匿名の users/show は 404 になる
function mockSigninApis(): void {
	apiMock.mockImplementation((endpoint: string, payload?: Record<string, unknown>) => {
		if (endpoint === 'users/show') {
			return Promise.reject(new Error('NO_SUCH_USER'));
		}
		if (endpoint === 'signin-flow') {
			if (payload != null && payload['password'] != null) {
				return Promise.resolve({ finished: true, i: 'test-token', deviceToken: 'test-device-token' });
			}
			return Promise.resolve({ finished: false, next: 'password' });
		}
		return Promise.resolve({});
	});
}

describe('MkSignin (ugcVisibilityForVisitor=none, anonymous users/show 404)', () => {
	afterEach(() => {
		cleanup();
		apiMock.mockReset();
	});

	test('users/show が 404 でもパスワード画面に進み、入力したユーザー名でログインできる', async () => {
		updateI18n(locales['ja-JP']);
		mockSigninApis();
		const loginHandler = vi.fn();
		const r = render(MkSignin, {
			props: { onLogin: loginHandler },
			global: { components, directives },
		});

		// 1. ユーザー名入力 → 送信
		const inputPage = await r.findByTestId('signin-page-input');
		const usernameInput = inputPage.querySelector('input')!;
		expect(usernameInput).toBeTruthy();
		await fireEvent.update(usernameInput, 'Tester');
		await fireEvent.click(r.getByTestId('signin-page-input-continue'));

		// 2. 白紙にならずパスワード画面が表示される (旧: userInfo null で TypeError 白紙)
		const passwordPage = await r.findByTestId('signin-page-password', undefined, { timeout: 3000 });
		expect(passwordPage).toBeTruthy();

		// 3. オートコンプリート用 hidden input が入力したユーザー名を持つ
		await waitFor(() => {
			const hidden = passwordPage.querySelector('input[name="username"]') as HTMLInputElement | null;
			expect(hidden?.value).toBe('Tester');
		});

		// 4. パスワード送信で入力したユーザー名のまま signin-flow が呼ばれる
		const pwInput = passwordPage.querySelector('input[type="password"]')!;
		expect(pwInput).toBeTruthy();
		await fireEvent.update(pwInput, 'pw-1234');
		const form = passwordPage.querySelector('form')!;
		expect(form).toBeTruthy();
		await fireEvent.submit(form);
		await waitFor(() => {
			expect(apiMock).toHaveBeenCalledWith('signin-flow', expect.objectContaining({
				username: 'Tester',
				password: 'pw-1234',
			}));
		});
		await waitFor(() => {
			expect(loginHandler).toHaveBeenCalled();
		});
	});
});
