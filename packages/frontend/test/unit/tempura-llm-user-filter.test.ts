/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { cleanup, fireEvent, render, type RenderResult } from '@testing-library/vue';
import { directives } from '@/directives/index.js';
import { components } from '@/components/index.js';
import { i18n } from '@/i18n.js';
import { PreferencesManager } from '@/preferences/manager.js';
import XTempuraLlmSettings from '@/pages/settings/tempura-settings/tempura-llm.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';

const { apiMock, selectUserMock } = vi.hoisted(() => ({
	apiMock: vi.fn(),
	selectUserMock: vi.fn(),
}));

vi.mock('@/os.js', async (importOriginal) => ({
	...(await importOriginal() as Record<string, unknown>),
	selectUser: selectUserMock,
	// 設定ページだけを描画するのでダイアログは使わない
	popup: vi.fn(),
	alert: vi.fn(),
	confirm: vi.fn(async () => ({ canceled: false })),
	waiting: vi.fn(() => vi.fn()),
}));
vi.mock('@/utility/misskey-api.js', async (importOriginal) => ({
	...(await importOriginal() as Record<string, unknown>),
	misskeyApi: apiMock,
}));
vi.mock('@/utility/tempura-script/llm.js', async (importOriginal) => ({
	...(await importOriginal() as Record<string, unknown>),
	// 設定ページの読み込みで外部 API を叩かないようにする
	fetchAvailableModels: vi.fn(async () => []),
}));
// v-panel ディレクティブが参照するコンパイル済みテーマの最小モック
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

// MkFolder を開いた状態で中身を描画する (アコーディオンの開閉はこのテストの対象外)
vi.mock('@/components/MkFolder.vue', async () => ({
	default: defineComponent({
		name: 'MkFolderStub',
		setup(_props, { slots }) {
			return () => h('div', { 'data-testid': 'folder' }, [
				slots.label?.(),
				slots.default?.(),
			]);
		},
	}),
}));

/** 保存先もクラウド同期も持たない設定マネージャ */
function realPreferences(): PreferencesManager {
	return new PreferencesManager({
		load: () => null,
		save: () => {},
		cloudGetBulk: async () => ({}),
		cloudGet: async () => null,
		cloudSet: async () => {},
	}, { id: 'test-user' });
}

const LOCAL_ID = 'local-user-id';
const REMOTE_ID = 'remote-user-id';
const GONE_ID = 'suspended-user-id';

const localUser = { id: LOCAL_ID, username: 'alice', host: null };
const remoteUser = { id: REMOTE_ID, username: 'bob', host: 'remote.example' };

/**
 * users/show は凍結・削除済みのユーザーを返さない。
 * GONE_ID は保存済みだが取得結果に含めない、という実挙動を再現する。
 */
function stubUserShow(): void {
	apiMock.mockImplementation(async (endpoint: string, payload: Record<string, unknown>) => {
		if (endpoint === 'users/show') {
			const ids = (payload.userIds ?? []) as string[];
			return [localUser, remoteUser].filter((u) => ids.includes(u.id));
		}
		return {};
	});
}

describe('LLM設定 > TLダイジェストのユーザーフィルタ表示', () => {
	let prefer: PreferencesManager;

	afterEach(() => {
		cleanup();
		apiMock.mockReset();
		selectUserMock.mockReset();
		vi.restoreAllMocks();
	});

	beforeEach(async () => {
		prefer = realPreferences();
		const preferencesModule = await import('@/preferences.js');
		vi.spyOn(preferencesModule, 'prefer', 'get').mockReturnValue(prefer);
	});

	const mountSection = async (ids: string[]): Promise<RenderResult> => {
		stubUserShow();
		prefer.commit('tlDigestUserFilterMode', 'block');
		prefer.commit('tlDigestUserFilterUserIds', ids);
		const page = render(XTempuraLlmSettings, { global: { directives, components } });
		// 取得は非同期なので、行が描画されるまで待つ
		await page.findByText('@alice');
		return page;
	};

	const removeButtons = (page: RenderResult, label: string): HTMLElement[] =>
		[...page.container.querySelectorAll<HTMLElement>('button')].filter((b) => b.textContent?.trim() === label);

	test('取得できない保存済みユーザーも行として残り、削除できる', async () => {
		const page = await mountSection([LOCAL_ID, GONE_ID]);

		// 取得できなかった ID も名前の代わりに ID を出して行を残す
		const rawRow = await page.findByText(GONE_ID);
		expect(rawRow.tagName).not.toBe('A');

		// 行ごとの削除ボタンが 2 つ (取得済み 1 + 取得できなかった 1) ある
		const buttons = removeButtons(page, i18n.ts._tlDigest.userFilterUsersRemove);
		expect(buttons).toHaveLength(2);

		await fireEvent.click(buttons[1]);
		expect(prefer.s.tlDigestUserFilterUserIds).toEqual([LOCAL_ID]);
		// 削除後は残りのユーザーの名前だけが表示される
		await page.findByText('@alice');
		expect(page.queryByText(GONE_ID)).toBeNull();
	});

	test('取得済みのユーザーは名前でリンクし、リモートはホスト付きのパスにする', async () => {
		const page = await mountSection([LOCAL_ID, REMOTE_ID]);

		const localLink = (await page.findByText('@alice')).closest('a');
		expect(localLink?.getAttribute('href')).toBe('/@alice');

		const remoteLink = (await page.findByText('@bob@remote.example')).closest('a');
		expect(remoteLink?.getAttribute('href')).toBe('/@bob@remote.example');
	});

	test('絞り込みモードのradioは表示テキストを名前に持つ', async () => {
		const page = await mountSection([LOCAL_ID]);

		const allowRadio = page.getByRole('radio', { name: i18n.ts._tlDigest.userFilterModeAllow });
		await fireEvent.click(allowRadio);
		expect(prefer.s.tlDigestUserFilterMode).toBe('allow');
	});

	test('ミュート済みのユーザーでも絞り込み対象を識別できる', async () => {
		prefer.commit('anonymizeMutedUsers', true);
		const mutedUser = {
			...localUser,
			name: null,
			avatarUrl: 'https://example.com/avatar.png',
			avatarBlurhash: null,
			isCat: false,
			isMuted: true,
			approved: true,
			emojis: {},
			onlineStatus: 'unknown' as const,
		};
		apiMock.mockImplementation(async (endpoint: string, payload: Record<string, unknown>) => {
			if (endpoint === 'users/show') {
				const ids = (payload.userIds ?? []) as string[];
				return ids.includes(LOCAL_ID) ? [mutedUser] : [];
			}
			return {};
		});
		prefer.commit('tlDigestUserFilterMode', 'block');
		prefer.commit('tlDigestUserFilterUserIds', [LOCAL_ID]);
		const page = render(XTempuraLlmSettings, { global: { directives, components } });

		await page.findByText('@alice');
		expect(page.queryByText(i18n.ts.mutedUsers)).toBeNull();
		expect(page.container.querySelector('img')?.getAttribute('src')).toBe(mutedUser.avatarUrl);

		const normalCard = render(MkUserCardMini, {
			props: { user: mutedUser, withChart: false },
			global: { directives, components },
		});
		expect(normalCard.queryByText(i18n.ts.mutedUsers)).not.toBeNull();
		expect(normalCard.container.querySelector('img')?.getAttribute('src')).not.toBe(mutedUser.avatarUrl);
	});

	test('選択済みのユーザーを重複させずに追加できる', async () => {
		const page = await mountSection([LOCAL_ID]);
		const rowCount = () => page.container.querySelectorAll<HTMLElement>('button').length;

		selectUserMock.mockResolvedValue({ id: REMOTE_ID, username: 'bob', host: 'remote.example' });
		const before = rowCount();
		await fireEvent.click(await page.findByText(i18n.ts._tlDigest.userFilterUsersAdd));
		await vi.waitFor(() => expect(prefer.s.tlDigestUserFilterUserIds).toEqual([LOCAL_ID, REMOTE_ID]));
		await page.findByText('@bob@remote.example');
		expect(rowCount()).toBeGreaterThan(before);

		// 同じユーザーをもう一度選んでも増えない
		await fireEvent.click(await page.findByText(i18n.ts._tlDigest.userFilterUsersAdd));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(prefer.s.tlDigestUserFilterUserIds).toEqual([LOCAL_ID, REMOTE_ID]);
	});

	test('ユーザー情報の取得中に一覧が変わっても、解決時点で保存されている ID は名前で表示する', async () => {
		// users/show の応答を保留したまま、取得待ちの間に一覧が変化する状況を作る
		let releaseUserShow!: () => void;
		const userShowGate = new Promise<void>((resolve) => {
			releaseUserShow = resolve;
		});
		apiMock.mockImplementation(async (endpoint: string, payload: Record<string, unknown>) => {
			if (endpoint === 'users/show') {
				await userShowGate;
				const ids = (payload.userIds ?? []) as string[];
				return [localUser, remoteUser].filter((u) => ids.includes(u.id));
			}
			return {};
		});

		prefer.commit('tlDigestUserFilterMode', 'block');
		prefer.commit('tlDigestUserFilterUserIds', [LOCAL_ID, REMOTE_ID]);
		const page = render(XTempuraLlmSettings, { global: { directives, components } });

		// 取得が終わる前は、名前が分からないので ID で並ぶ
		await page.findByText(LOCAL_ID);

		// 取得中にリモートユーザーを削除し、その応答が届く前に別タブから同じ ID が再同期される
		const removeButtons = (): HTMLElement[] =>
			[...page.container.querySelectorAll<HTMLElement>('button')]
				.filter((b) => b.textContent?.trim() === i18n.ts._tlDigest.userFilterUsersRemove);
		await fireEvent.click(removeButtons()[1]);
		expect(prefer.s.tlDigestUserFilterUserIds).toEqual([LOCAL_ID]);
		prefer.commit('tlDigestUserFilterUserIds', [LOCAL_ID, REMOTE_ID]);

		// ここで取得が解決する。要求時の一覧ではなく解決時の保存済み ID を基準にすれば、
		// 保存されている REMOTE_ID は取得結果で名前を表示できる
		releaseUserShow();
		await page.findByText('@alice');
		await page.findByText('@bob@remote.example');
		expect(page.queryByText(REMOTE_ID)).toBeNull();
		expect(removeButtons()).toHaveLength(2);
	});

	test('選択ダイアログを開いている間に削除されたユーザーを、古い一覧で復活させない', async () => {
		const page = await mountSection([LOCAL_ID, REMOTE_ID]);

		// ダイアログの応答を保留して、開いている間の設定変更を再現する
		let resolveSelect!: (user: unknown) => void;
		selectUserMock.mockReturnValue(new Promise((resolve) => {
			resolveSelect = resolve;
		}));

		await fireEvent.click(await page.findByText(i18n.ts._tlDigest.userFilterUsersAdd));

		// ダイアログが開いている間にリモートユーザーを削除する
		// (別タブからの同期や、ダイアログの背後での削除に相当)
		const removeButtons = [...page.container.querySelectorAll<HTMLElement>('button')]
			.filter((b) => b.textContent?.trim() === i18n.ts._tlDigest.userFilterUsersRemove);
		await fireEvent.click(removeButtons[1]);
		expect(prefer.s.tlDigestUserFilterUserIds).toEqual([LOCAL_ID]);

		// ダイアログで新しいユーザーを選ぶ。開く前の一覧を書き戻すと REMOTE_ID が復活する
		resolveSelect({ id: 'third-user-id', username: 'carol', host: null });
		await vi.waitFor(() => expect(prefer.s.tlDigestUserFilterUserIds).toEqual([LOCAL_ID, 'third-user-id']));
		expect(page.queryByText('@bob@remote.example')).toBeNull();
	});
});
