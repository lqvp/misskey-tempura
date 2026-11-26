/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { defineComponent, h, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import { host } from '@@/js/config.js';
import { directives } from '@/directives/index.js';
import { components } from '@/components/index.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import { provideMetadataReceiver } from '@/page.js';
import { store } from '@/store.js';
import { removeAccount, refreshCurrentAccount } from '@/accounts.js';
import SecurityPage from '@/pages/settings/security.vue';

type Deferred = {
	promise: Promise<void>;
	resolve: () => void;
	reject: (err?: unknown) => void;
};

function createDeferred(): Deferred {
	let resolve!: () => void;
	let reject!: (err?: unknown) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const {
	authenticateDialogMock,
	waitingMock,
	hideWaitingMock,
	alertMock,
	misskeyApiMock,
	cloudBackupMock,
	signoutMock,
	unisonReloadMock,
	reloadChannelPostMessageMock,
	preferState,
	preferCommitMock,
	currentAccount,
} = vi.hoisted(() => {
	const hideWaiting = vi.fn();
	const state: Record<string, unknown> = {
		autoplayEmbededPlayerOfUrlPreview: true,
		dataSaver: {
			media: false,
			avatar: false,
			urlPreview: false,
			code: false,
		},
		mutingEmojis: [],
		accounts: [] as [string, { id: string; username: string }][],
	};
	const commit = vi.fn((key: string, value: unknown) => {
		state[key] = value;
	});
	return {
		authenticateDialogMock: vi.fn(),
		waitingMock: vi.fn(() => hideWaiting),
		hideWaitingMock: hideWaiting,
		alertMock: vi.fn(() => Promise.resolve()),
		misskeyApiMock: vi.fn((_endpoint: string, _payload?: unknown): Promise<unknown> => Promise.resolve({})),
		cloudBackupMock: vi.fn(() => Promise.resolve()),
		signoutMock: vi.fn(() => Promise.resolve()),
		unisonReloadMock: vi.fn(),
		reloadChannelPostMessageMock: vi.fn(),
		preferState: state,
		preferCommitMock: commit,
		currentAccount: {
			id: 'acct-current',
			username: 'alice',
			token: 'token-current',
			policies: {},
		} as unknown as Misskey.entities.MeDetailed & { token: string },
	};
});

vi.mock('@/i.js', () => ({
	$i: currentAccount,
	ensureSignin: () => currentAccount,
	iAmAdmin: false,
	iAmModerator: false,
	iAmSubModerator: false,
}));

vi.mock('@/preferences.js', () => {
	const preferReactive: Record<string, unknown> = {};
	for (const key in preferState) {
		preferReactive[key] = ref(preferState[key]);
	}
	return {
		prefer: {
			s: preferState,
			r: preferReactive,
			commit: preferCommitMock,
		},
	};
});

vi.mock('@/os.js', () => ({
	authenticateDialog: authenticateDialogMock,
	waiting: waitingMock,
	alert: alertMock,
	popup: vi.fn(() => ({ dispose: vi.fn() })),
	popupMenu: vi.fn(),
	modalMenu: vi.fn(),
	contextMenu: vi.fn(),
	success: vi.fn(() => Promise.resolve()),
	confirm: vi.fn(() => Promise.resolve({ canceled: true })),
	inputText: vi.fn(() => Promise.resolve({ canceled: true })),
	select: vi.fn(() => Promise.resolve({ canceled: true })),
	apiWithDialog: vi.fn(() => Promise.resolve()),
	toast: vi.fn(),
	pageWindow: vi.fn(),
	openingWindowsCount: ref(0),
	popups: ref([]),
}));

vi.mock('@/utility/misskey-api.js', async (importOriginal) => ({
	...(await importOriginal() as Record<string, unknown>),
	misskeyApi: misskeyApiMock,
}));

vi.mock('@/preferences/utility.js', async (importOriginal) => ({
	...(await importOriginal() as Record<string, unknown>),
	cloudBackup: cloudBackupMock,
}));

vi.mock('@/signout.js', () => ({
	signout: signoutMock,
}));

vi.mock('@/utility/unison-reload.js', () => ({
	unisonReload: unisonReloadMock,
	reloadChannel: {
		postMessage: reloadChannelPostMessageMock,
	},
}));

vi.mock('@/pages/settings/2fa.vue', () => ({
	default: {
		name: 'X2faStub',
		render: () => null,
	},
}));

vi.mock('@/theme.js', async (importOriginal) => {
	const actual = await importOriginal() as Record<string, unknown>;
	const themeManager = (actual as { themeManager: Record<string, unknown> }).themeManager;
	return {
		...actual,
		themeManager: new Proxy(themeManager, {
			get(target, prop, receiver) {
				if (prop === 'currentCompiledTheme') return { panel: 'transparent' };
				return Reflect.get(target, prop, receiver);
			},
		}),
	};
});

const otherHost = 'other.example.test';
const currentKey = `${host}/acct-current`;
const otherSameHostKey = `${host}/acct-other`;
const otherRemoteHostKey = `${otherHost}/acct-remote`;

function makeAccountInfo(id: string, username: string): Misskey.entities.MeDetailed {
	return { id, username } as Misskey.entities.MeDetailed;
}

describe('removeAccount とログイン・トークン再生成時の他アカウント保護', () => {
	beforeAll(async () => {
		await store.ready;
	});

	beforeEach(() => {
		window.localStorage.clear();
		miLocalStorage.setItem('account', JSON.stringify(currentAccount));
		miLocalStorage.setItem('loginDeviceToken', 'device-token-keep');
		miLocalStorage.setItem('preferences', JSON.stringify({ id: 'pref-keep' }));
		miLocalStorage.setItem('theme', 'dark-theme-keep');

		store.s.accountTokens = {
			[currentKey]: 'token-current',
			[otherSameHostKey]: 'token-other',
			[otherRemoteHostKey]: 'token-remote',
		};
		store.s.accountInfos = {
			[currentKey]: makeAccountInfo('acct-current', 'alice'),
			[otherSameHostKey]: makeAccountInfo('acct-other', 'bob'),
			[otherRemoteHostKey]: makeAccountInfo('acct-remote', 'carol'),
		};
		store.s.enablePreferencesAutoCloudBackup = false;

		preferState.accounts = [
			[host, { id: 'acct-current', username: 'alice' }],
			[host, { id: 'acct-other', username: 'bob' }],
			[otherHost, { id: 'acct-remote', username: 'carol' }],
		];

		authenticateDialogMock.mockReset();
		waitingMock.mockClear();
		hideWaitingMock.mockReset();
		alertMock.mockClear();
		misskeyApiMock.mockReset();
		cloudBackupMock.mockReset();
		cloudBackupMock.mockResolvedValue(undefined);
		signoutMock.mockReset();
		signoutMock.mockResolvedValue(undefined);
		unisonReloadMock.mockReset();
		preferCommitMock.mockReset();
		preferCommitMock.mockImplementation((key: string, value: unknown) => {
			preferState[key] = value;
		});

		misskeyApiMock.mockImplementation((endpoint: string) => {
			if (endpoint === 'i/signin-history' || endpoint === 'i/login-risk-footprints') {
				return Promise.resolve([]);
			}
			return Promise.resolve({});
		});
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	describe('removeAccount', () => {
		test('対象アカウントのみを削除し、他アカウントを残したうえで store.set の永続化完了を待つ', async () => {
			const tokenDeferred = createDeferred();
			const infoDeferred = createDeferred();

			const setSpy = vi.spyOn(store, 'set').mockImplementation((key, value) => {
				(store.s as Record<string, unknown>)[key] = value;
				if (key === 'accountTokens') return tokenDeferred.promise;
				if (key === 'accountInfos') return infoDeferred.promise;
				return Promise.resolve();
			});

			let resolved = false;
			const removePromise = removeAccount(host, 'acct-current').then(() => {
				resolved = true;
			});

			// まだ両方の store.set が完了していないため解決してはならない
			await Promise.resolve();
			await Promise.resolve();
			expect(resolved).toBe(false);

			// 片方だけ解決してもまだ完了してはならない
			tokenDeferred.resolve();
			await Promise.resolve();
			await Promise.resolve();
			expect(resolved).toBe(false);

			// 両方の IndexedDB 書き込み完了後に解決する
			infoDeferred.resolve();
			await removePromise;
			expect(resolved).toBe(true);

			expect(setSpy).toHaveBeenCalledWith('accountTokens', {
				[otherSameHostKey]: 'token-other',
				[otherRemoteHostKey]: 'token-remote',
			});
			expect(setSpy).toHaveBeenCalledWith('accountInfos', {
				[otherSameHostKey]: makeAccountInfo('acct-other', 'bob'),
				[otherRemoteHostKey]: makeAccountInfo('acct-remote', 'carol'),
			});
			expect(preferCommitMock).toHaveBeenCalledWith('accounts', [
				[host, { id: 'acct-other', username: 'bob' }],
				[otherHost, { id: 'acct-remote', username: 'carol' }],
			]);
		});

		test('prefer.commit が同期例外を投げても accountTokens と accountInfos の削除と永続化待機を完了してから例外を再送出する', async () => {
			const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError');
			preferCommitMock.mockImplementationOnce(() => {
				throw quotaError;
			});

			const tokenDeferred = createDeferred();
			const infoDeferred = createDeferred();
			const setSpy = vi.spyOn(store, 'set').mockImplementation((key, value) => {
				(store.s as Record<string, unknown>)[key] = value;
				if (key === 'accountTokens') return tokenDeferred.promise;
				if (key === 'accountInfos') return infoDeferred.promise;
				return Promise.resolve();
			});

			let settled = false;
			let caughtError: unknown;
			const removePromise = removeAccount(host, 'acct-current').catch(err => {
				caughtError = err;
			}).finally(() => {
				settled = true;
			});

			await Promise.resolve();
			await Promise.resolve();
			expect(setSpy).toHaveBeenCalledWith('accountTokens', {
				[otherSameHostKey]: 'token-other',
				[otherRemoteHostKey]: 'token-remote',
			});
			expect(setSpy).toHaveBeenCalledWith('accountInfos', {
				[otherSameHostKey]: makeAccountInfo('acct-other', 'bob'),
				[otherRemoteHostKey]: makeAccountInfo('acct-remote', 'carol'),
			});
			expect(store.s.accountTokens).toEqual({
				[otherSameHostKey]: 'token-other',
				[otherRemoteHostKey]: 'token-remote',
			});
			expect(store.s.accountInfos).toEqual({
				[otherSameHostKey]: makeAccountInfo('acct-other', 'bob'),
				[otherRemoteHostKey]: makeAccountInfo('acct-remote', 'carol'),
			});
			expect(settled).toBe(false);

			tokenDeferred.resolve();
			await Promise.resolve();
			await Promise.resolve();
			expect(settled).toBe(false);

			infoDeferred.resolve();
			await removePromise;
			expect(settled).toBe(true);
			expect(caughtError).toBe(quotaError);
		});

		test('1 つ目の store.set が reject しても 2 つ目の store.set が完了するまで待ってから reject する', async () => {
			const tokenError = new Error('TOKEN_IDB_FAILED');
			const tokenDeferred = createDeferred();
			const infoDeferred = createDeferred();

			vi.spyOn(store, 'set').mockImplementation((key, value) => {
				(store.s as Record<string, unknown>)[key] = value;
				if (key === 'accountTokens') return tokenDeferred.promise;
				if (key === 'accountInfos') return infoDeferred.promise;
				return Promise.resolve();
			});

			let settled = false;
			let caughtError: unknown;
			const removePromise = removeAccount(host, 'acct-current').catch(err => {
				caughtError = err;
			}).finally(() => {
				settled = true;
			});

			tokenDeferred.reject(tokenError);
			await Promise.resolve();
			await Promise.resolve();
			// 2 つ目の IndexedDB 書き込みが終わるまでは reject しない
			expect(settled).toBe(false);
			expect(preferCommitMock).toHaveBeenCalledWith('accounts', [
				[host, { id: 'acct-other', username: 'bob' }],
				[otherHost, { id: 'acct-remote', username: 'carol' }],
			]);

			infoDeferred.resolve();
			await removePromise;
			expect(settled).toBe(true);
			expect(caughtError).toBe(tokenError);
		});

		test('refreshCurrentAccount が失効アカウントを処理するとき、removeAccount の永続化完了後に signout を呼ぶ', async () => {
			store.s.accountTokens = { [currentKey]: 'token-current' };
			store.s.accountInfos = { [currentKey]: makeAccountInfo('acct-current', 'alice') };
			preferState.accounts = [[host, { id: 'acct-current', username: 'alice' }]];

			const tokenDeferred = createDeferred();
			const infoDeferred = createDeferred();

			const setSpy = vi.spyOn(store, 'set').mockImplementation((key, value) => {
				(store.s as Record<string, unknown>)[key] = value;
				if (key === 'accountTokens') return tokenDeferred.promise;
				if (key === 'accountInfos') return infoDeferred.promise;
				return Promise.resolve();
			});

			const originalFetch = window.fetch;
			const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
				error: { id: 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14' },
			}), { status: 403 }));
			window.fetch = fetchSpy as unknown as typeof window.fetch;

			try {
				const refreshPromise = refreshCurrentAccount();

				await waitFor(() => {
					expect(fetchSpy).toHaveBeenCalledTimes(1);
					expect(alertMock).toHaveBeenCalledTimes(1);
					expect(setSpy).toHaveBeenCalledTimes(2);
					expect(preferCommitMock).toHaveBeenCalledWith('accounts', []);
				});

				// removeAccount の store.set が完了する前は signout が呼ばれないこと
				expect(signoutMock).not.toHaveBeenCalled();

				tokenDeferred.resolve();
				infoDeferred.resolve();
				await refreshPromise;

				expect(signoutMock).toHaveBeenCalledTimes(1);
			} finally {
				window.fetch = originalFetch;
			}
		});

		test('refreshCurrentAccount で removeAccount が失敗しても console.error を記録して signout を実行する', async () => {
			store.s.accountTokens = { [currentKey]: 'token-current' };
			store.s.accountInfos = { [currentKey]: makeAccountInfo('acct-current', 'alice') };
			preferState.accounts = [[host, { id: 'acct-current', username: 'alice' }]];

			const idbError = new Error('IDB_FAILED');
			vi.spyOn(store, 'set').mockImplementation((key, value) => {
				(store.s as Record<string, unknown>)[key] = value;
				return Promise.reject(idbError);
			});
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const originalFetch = window.fetch;
			const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
				error: { id: 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14' },
			}), { status: 403 }));
			window.fetch = fetchSpy as unknown as typeof window.fetch;

			try {
				await refreshCurrentAccount();

				expect(consoleErrorSpy).toHaveBeenCalledWith(idbError);
				expect(signoutMock).toHaveBeenCalledTimes(1);
			} finally {
				window.fetch = originalFetch;
			}
		});

		test('refreshCurrentAccount で他アカウントが残っているときに removeAccount が失敗しても console.error を記録して他アカウントへ login を実行する', async () => {
			store.s.accountTokens = {
				[currentKey]: 'token-current',
				[otherSameHostKey]: 'token-other',
			};
			store.s.accountInfos = {
				[currentKey]: makeAccountInfo('acct-current', 'alice'),
				[otherSameHostKey]: makeAccountInfo('acct-other', 'bob'),
			};
			preferState.accounts = [
				[host, { id: 'acct-current', username: 'alice' }],
				[host, { id: 'acct-other', username: 'bob' }],
			];

			const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError');
			preferCommitMock.mockImplementationOnce(() => {
				throw quotaError;
			});
			vi.spyOn(store, 'set').mockImplementation((key, value) => {
				(store.s as Record<string, unknown>)[key] = value;
				return Promise.resolve();
			});
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const originalFetch = window.fetch;
			const fetchSpy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				const parsed = JSON.parse(String(init?.body ?? '{}')) as { i?: string };
				if (parsed.i === 'token-current') {
					return new Response(JSON.stringify({
						error: { id: 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14' },
					}), { status: 403 });
				}
				return new Response(JSON.stringify(makeAccountInfo('acct-other', 'bob')), { status: 200 });
			});
			window.fetch = fetchSpy as unknown as typeof window.fetch;

			try {
				await refreshCurrentAccount();

				await waitFor(() => {
					expect(unisonReloadMock).toHaveBeenCalledTimes(1);
				});

				expect(consoleErrorSpy).toHaveBeenCalledWith(quotaError);
				expect(signoutMock).not.toHaveBeenCalled();
				expect(fetchSpy).toHaveBeenCalledTimes(2);
				expect(JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body ?? '{}'))).toEqual({ i: 'token-other' });
			} finally {
				window.fetch = originalFetch;
			}
		});
	});

	describe('security.vue regenerateToken', () => {
		const SecurityPageHost = defineComponent({
			name: 'SecurityPageHost',
			setup() {
				provideMetadataReceiver(() => {});
				return () => h(SecurityPage);
			},
		});

		function renderSecurityPage(errorHandler?: (err: unknown) => void) {
			return render(SecurityPageHost, {
				global: {
					directives,
					components,
					config: errorHandler ? { errorHandler } : undefined,
				},
			});
		}

		test('トークン再生成成功時は signout を呼ばず対象アカウントのみ削除し、他アカウント・loginDeviceToken・端末設定を保持して再ログインへ遷移する', async () => {
			store.s.enablePreferencesAutoCloudBackup = true;
			authenticateDialogMock.mockResolvedValue({
				canceled: false,
				result: { password: 'pw-value', token: '123456' },
			});

			const tokenDeferred = createDeferred();
			const infoDeferred = createDeferred();
			const callOrder: string[] = [];

			misskeyApiMock.mockImplementation((endpoint: string) => {
				if (endpoint === 'i/regenerate-token') {
					callOrder.push('i/regenerate-token');
					return Promise.resolve(undefined);
				}
				return Promise.resolve([]);
			});

			cloudBackupMock.mockImplementation(() => {
				callOrder.push('cloudBackup');
				return Promise.resolve();
			});

			vi.spyOn(store, 'set').mockImplementation((key, value) => {
				(store.s as Record<string, unknown>)[key] = value;
				if (key === 'accountTokens') {
					callOrder.push('store.set:accountTokens');
					return tokenDeferred.promise;
				}
				if (key === 'accountInfos') {
					callOrder.push('store.set:accountInfos');
					return infoDeferred.promise;
				}
				return Promise.resolve();
			});

			unisonReloadMock.mockImplementation(() => {
				callOrder.push('unisonReload');
			});

			const page = renderSecurityPage();
			const button = page.getByText(i18n.ts.regenerateLoginToken).closest('button')!;
			await fireEvent.click(button);

			await waitFor(() => {
				expect(misskeyApiMock).toHaveBeenCalledWith('i/regenerate-token', {
					password: 'pw-value',
					token: '123456',
				});
			});

			// removeAccount の store.set 完了前は localStorage の account 削除と reload を走らせない
			await waitFor(() => {
				expect(preferCommitMock).toHaveBeenCalledWith('accounts', [
					[host, { id: 'acct-other', username: 'bob' }],
					[otherHost, { id: 'acct-remote', username: 'carol' }],
				]);
			});
			expect(miLocalStorage.getItem('account')).not.toBeNull();
			expect(unisonReloadMock).not.toHaveBeenCalled();

			tokenDeferred.resolve();
			infoDeferred.resolve();

			await waitFor(() => {
				expect(unisonReloadMock).toHaveBeenCalledWith('/');
			});

			expect(signoutMock).not.toHaveBeenCalled();
			expect(cloudBackupMock).toHaveBeenCalledTimes(1);
			expect(miLocalStorage.getItem('account')).toBeNull();
			expect(miLocalStorage.getItem('loginDeviceToken')).toBe('device-token-keep');
			expect(miLocalStorage.getItem('preferences')).toBe(JSON.stringify({ id: 'pref-keep' }));
			expect(miLocalStorage.getItem('theme')).toBe('dark-theme-keep');
			expect(store.s.accountTokens).toEqual({
				[otherSameHostKey]: 'token-other',
				[otherRemoteHostKey]: 'token-remote',
			});
			expect(store.s.accountInfos).toEqual({
				[otherSameHostKey]: makeAccountInfo('acct-other', 'bob'),
				[otherRemoteHostKey]: makeAccountInfo('acct-remote', 'carol'),
			});
			expect(callOrder.indexOf('cloudBackup')).toBeLessThan(callOrder.indexOf('i/regenerate-token'));
			expect(callOrder.indexOf('i/regenerate-token')).toBeLessThan(callOrder.indexOf('store.set:accountTokens'));
			expect(callOrder.indexOf('store.set:accountInfos')).toBeLessThan(callOrder.indexOf('unisonReload'));
		});

		test('i/regenerate-token が失敗したときは待機表示を閉じてエラーダイアログを表示し、アカウント情報や localStorage を変更せず Vue errorHandler へ送出しない', async () => {
			const apiError = { message: 'Incorrect password.', code: 'INCORRECT_PASSWORD', id: '932c904e-9460-45b7-9ce6-7ed33be7eb2c' };
			const capturedErrors: unknown[] = [];

			authenticateDialogMock.mockResolvedValue({
				canceled: false,
				result: { password: 'wrong-password', token: null },
			});
			misskeyApiMock.mockImplementation((endpoint: string) => {
				if (endpoint === 'i/regenerate-token') {
					return Promise.reject(apiError);
				}
				return Promise.resolve([]);
			});

			const setSpy = vi.spyOn(store, 'set');
			const page = renderSecurityPage((err) => {
				capturedErrors.push(err);
			});

			const button = page.getByText(i18n.ts.regenerateLoginToken).closest('button')!;
			await fireEvent.click(button);

			await waitFor(() => {
				expect(hideWaitingMock).toHaveBeenCalledTimes(1);
				expect(alertMock).toHaveBeenCalledTimes(1);
			});

			expect(alertMock).toHaveBeenCalledWith({
				type: 'error',
				text: 'Incorrect password.',
			});
			expect(capturedErrors).toEqual([]);
			expect(setSpy).not.toHaveBeenCalled();
			expect(preferCommitMock).not.toHaveBeenCalled();
			expect(signoutMock).not.toHaveBeenCalled();
			expect(unisonReloadMock).not.toHaveBeenCalled();
			expect(miLocalStorage.getItem('account')).toBe(JSON.stringify(currentAccount));
			expect(miLocalStorage.getItem('loginDeviceToken')).toBe('device-token-keep');
		});

		test('i/regenerate-token がメッセージを持たない値で失敗したときは汎用エラー文言でエラーダイアログを表示する', async () => {
			const capturedErrors: unknown[] = [];

			authenticateDialogMock.mockResolvedValue({
				canceled: false,
				result: { password: 'wrong-password', token: null },
			});
			misskeyApiMock.mockImplementation((endpoint: string) => {
				if (endpoint === 'i/regenerate-token') {
					return Promise.reject({});
				}
				return Promise.resolve([]);
			});

			const page = renderSecurityPage((err) => {
				capturedErrors.push(err);
			});

			const button = page.getByText(i18n.ts.regenerateLoginToken).closest('button')!;
			await fireEvent.click(button);

			await waitFor(() => {
				expect(hideWaitingMock).toHaveBeenCalledTimes(1);
				expect(alertMock).toHaveBeenCalledWith({
					type: 'error',
					text: i18n.ts.somethingHappened,
				});
			});

			expect(capturedErrors).toEqual([]);
			expect(unisonReloadMock).not.toHaveBeenCalled();
		});

		test('認証ダイアログをキャンセルしたときは API 呼び出しや状態変更を行わない', async () => {
			authenticateDialogMock.mockResolvedValue({
				canceled: true,
				result: undefined,
			});

			const setSpy = vi.spyOn(store, 'set');
			const page = renderSecurityPage();
			const button = page.getByText(i18n.ts.regenerateLoginToken).closest('button')!;
			await fireEvent.click(button);

			await waitFor(() => {
				expect(authenticateDialogMock).toHaveBeenCalledTimes(1);
			});

			expect(waitingMock).not.toHaveBeenCalled();
			expect(misskeyApiMock).not.toHaveBeenCalledWith('i/regenerate-token', expect.anything());
			expect(setSpy).not.toHaveBeenCalled();
			expect(signoutMock).not.toHaveBeenCalled();
			expect(unisonReloadMock).not.toHaveBeenCalled();
			expect(miLocalStorage.getItem('account')).toBe(JSON.stringify(currentAccount));
		});

		test('i/regenerate-token 成功後に removeAccount の IndexedDB 書き込みが失敗しても、console.error を記録して account を削除し再ログインへ遷移し未処理エラーを出さない', async () => {
			const idbError = new Error('IDB_WRITE_FAILED');
			const capturedErrors: unknown[] = [];
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			authenticateDialogMock.mockResolvedValue({
				canceled: false,
				result: { password: 'pw-value', token: null },
			});
			misskeyApiMock.mockImplementation((endpoint: string) => {
				if (endpoint === 'i/regenerate-token') {
					return Promise.resolve(undefined);
				}
				return Promise.resolve([]);
			});
			vi.spyOn(store, 'set').mockRejectedValue(idbError);

			const page = renderSecurityPage((err) => {
				capturedErrors.push(err);
			});
			const button = page.getByText(i18n.ts.regenerateLoginToken).closest('button')!;
			await fireEvent.click(button);

			await waitFor(() => {
				expect(unisonReloadMock).toHaveBeenCalledWith('/');
			});

			expect(consoleErrorSpy).toHaveBeenCalledWith(idbError);
			expect(miLocalStorage.getItem('account')).toBeNull();
			expect(miLocalStorage.getItem('loginDeviceToken')).toBe('device-token-keep');
			expect(miLocalStorage.getItem('preferences')).toBe(JSON.stringify({ id: 'pref-keep' }));
			expect(signoutMock).not.toHaveBeenCalled();
			expect(capturedErrors).toEqual([]);
		});

		test('自動クラウドバックアップが失敗してもトークン再生成と対象アカウント削除は続行される', async () => {
			store.s.enablePreferencesAutoCloudBackup = true;
			cloudBackupMock.mockRejectedValue(new Error('CLOUD_BACKUP_FAILED'));
			authenticateDialogMock.mockResolvedValue({
				canceled: false,
				result: { password: 'pw-value', token: null },
			});
			misskeyApiMock.mockImplementation((endpoint: string) => {
				if (endpoint === 'i/regenerate-token') {
					return Promise.resolve(undefined);
				}
				return Promise.resolve([]);
			});
			vi.spyOn(store, 'set').mockImplementation((key, value) => {
				(store.s as Record<string, unknown>)[key] = value;
				return Promise.resolve();
			});

			const page = renderSecurityPage();
			const button = page.getByText(i18n.ts.regenerateLoginToken).closest('button')!;
			await fireEvent.click(button);

			await waitFor(() => {
				expect(unisonReloadMock).toHaveBeenCalledWith('/');
			});

			expect(cloudBackupMock).toHaveBeenCalledTimes(1);
			expect(misskeyApiMock).toHaveBeenCalledWith('i/regenerate-token', {
				password: 'pw-value',
				token: null,
			});
			expect(signoutMock).not.toHaveBeenCalled();
			expect(miLocalStorage.getItem('account')).toBeNull();
			expect(miLocalStorage.getItem('loginDeviceToken')).toBe('device-token-keep');
			expect(store.s.accountTokens).toEqual({
				[otherSameHostKey]: 'token-other',
				[otherRemoteHostKey]: 'token-remote',
			});
		});
	});
});
