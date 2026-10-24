/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, expect, test, vi } from 'vitest';
import { h, type Component } from 'vue';
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

const SECTION_MODULES = [
	'tempura-profile', 'tempura-privacy', 'tempura-notes', 'tempura-appearance',
	'tempura-behavior', 'tempura-drive', 'tempura-postform', 'tempura-timeline',
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

	test('プライバシーセクションがTempura設定ページの2番目に登録されている', async () => {
		for (const name of SECTION_MODULES) {
			vi.doMock(`@/pages/settings/tempura-settings/${name}.vue`, () => stubModule(name));
		}
		const page = render(XTempuraSettings, { global: { directives, components } });
		// 10個のスタブが全て描画されるのを待つ
		await page.findAllByText(() => true, { selector: '[data-stub-section]' }).catch(() => []);
		await vi.waitFor(() => {
			const stubs = page.container.querySelectorAll('[data-stub-section]');
			assert.strictEqual(stubs.length, SECTION_MODULES.length, '全セクションが描画される');
		});
		const order = [...page.container.querySelectorAll('[data-stub-section]')]
			.map((el) => el.getAttribute('data-stub-section'));
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
