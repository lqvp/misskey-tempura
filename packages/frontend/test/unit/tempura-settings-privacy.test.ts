/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, expect, test, vi } from 'vitest';
import { h, nextTick, type Component } from 'vue';
import { cleanup, fireEvent, render, type RenderResult } from '@testing-library/vue';
import { directives } from '@/directives/index.js';
import { components } from '@/components/index.js';
import { i18n } from '@/i18n.js';
import XTempuraSettings from '@/pages/settings/tempura-settings.vue';

const { apiMock, meFixture } = vi.hoisted(() => {
	return {
		apiMock: vi.fn((_endpoint: string, _payload: unknown) => Promise.resolve({})),
		meFixture: {
			id: 'test-user',
			username: 'tester',
			policies: { canAutoFollowBack: true },
			isLocked: false,
		},
	};
});

vi.mock('@/i.js', async (importOriginal) => ({
	...(await importOriginal() as Record<string, unknown>),
	ensureSignin: () => meFixture,
}));
vi.mock('@/utility/misskey-api.js', async (importOriginal) => ({
	...(await importOriginal() as Record<string, unknown>),
	misskeyApi: apiMock,
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

// tempura-drive は中身が空のため設定ページに描画していない
const SECTION_MODULES = [
	'tempura-profile', 'tempura-privacy', 'tempura-appearance', 'tempura-timeline',
	'tempura-behavior', 'tempura-postform', 'tempura-notes',
	'tempura-llm', 'tempura-earthquake',
] as const;

const stubModule = (name: string) => new Proxy({}, {
	get(_t, key) {
		if (key === 'default') return { name, render: () => h('div', { 'data-stub-section': name }) };
		if (key === '__esModule') return true;
		// @vue/test-utils のスタブ判定が __isTeleport 等の内部プロパティを読むので黙らせる
		return undefined;
	},
	has: () => true,
	ownKeys: () => ['default', '__esModule'],
	getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

describe('Tempura設定 > プライバシーセクション', () => {
	afterEach(() => {
		cleanup();
		apiMock.mockClear();
	});

	test('プライバシーセクションがTempura設定ページの2番目に登録されている', { timeout: 30_000 }, async () => {
		for (const name of SECTION_MODULES) {
			vi.doMock(`@/pages/settings/tempura-settings/${name}.vue`, () => stubModule(name));
		}
		// ここで検証したいのは「セクションの並び順」であって「描画の速さ」ではない。
		// セクションは defineAsyncComponent の動的 import で解決されるため、
		// フルスイート並列実行時はCPU競合で解決が遅れたり、まれに取りこぼすことがある。
		// マウントは 1 回だけ行い、描画結果の更新だけを待つ (毎回 render すると
		// インスタンスが積み上がって決着しなくなる)。
		const page = render(XTempuraSettings, { global: { directives, components } });
		const readOrder = () => [...page.container.querySelectorAll('[data-stub-section]')]
			.map((el) => el.getAttribute('data-stub-section'));

		// 非同期コンポーネントは「解決 -> 次のティックで描画」の順に進むため、
		// タイマーで待つだけでは描画が追いつかないことがある。
		// 明示的に nextTick を回して Vue のレンダーキューを消化させる。
		let order = readOrder();
		for (let tick = 0; tick < 200 && order.length !== SECTION_MODULES.length; tick++) {
			await nextTick();
			await new Promise((resolve) => setTimeout(resolve, 10));
			order = readOrder();
		}

		assert.strictEqual(order.length, SECTION_MODULES.length, '全セクションが描画される');
		assert.strictEqual(order[1], 'tempura-privacy', 'プライバシーがプロフィールの次(2番目)に配置されている');
	});

	test('復元したプライバシー設定が描画され、スイッチ切替が i/update に同じ設定値で保存される', async () => {
		vi.doUnmock('@/pages/settings/tempura-settings/tempura-privacy.vue');
		// vitest 5 では静的 import 済みのモジュールに vi.doMock が効かないため、
		// スタブを無効化したうえで実モジュールを動的に取得する
		const { default: XPrivacySettings } = await vi.importActual<{ default: Component }>('@/pages/settings/tempura-settings/tempura-privacy.vue');
		const page = render(XPrivacySettings, { global: { directives, components } });
		// フォルダを開く
		const header = page.container.querySelector<HTMLElement>('[data-testid="folder-header"]');
		assert.exists(header, 'プライバシーのフォルダヘッダが存在する');
		await fireEvent.click(header!);
		// 代表コントロールが描画される
		await page.findByText(i18n.ts.autoRejectFollowRequest);
		await page.findByText(i18n.ts.carefulBot);
		await page.findByText(i18n.ts.hideHomeNotes);
		// テンプレート先頭のスイッチ(autoRejectFollowRequest)を切り替えると
		// ストックのプライバシー設定と同じ設定値が i/update に送られる(値の共有の保証)
		const inputs = page.container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
		assert.isAbove(inputs.length, 0, 'スイッチのinputが存在する');
		await fireEvent.click(inputs[0]);
		expect(apiMock).toHaveBeenCalledWith('i/update', expect.objectContaining({
			autoRejectFollowRequest: true,
		}));
	});
});
