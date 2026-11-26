/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { h, type Component } from 'vue';
import { cleanup, fireEvent, render, type RenderResult } from '@testing-library/vue';
import { directives } from '@/directives/index.js';
import { components } from '@/components/index.js';
import { i18n } from '@/i18n.js';

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

describe('Tempura設定 > プライバシーセクション', () => {
	afterEach(() => {
		cleanup();
		apiMock.mockClear();
	});

	test('プライバシーセクションがTempura設定ページの2番目に登録されている', async () => {
		// セクションの並び順はテンプレートに静的に書かれている。
		// defineAsyncComponent の解決順に依存させると、フルスイート並列実行時の
		// CPU 競合で描画が間に合わずフレークするため、テンプレートの宣言順を直接検証する。
		// vitest の root は packages/frontend なので、そこからの相対パスで読む
		const source = await readFile('src/pages/settings/tempura-settings.vue', 'utf8');
		// 内側にも <template #label> があるため、最後の </template> で切る
		const template = source.slice(source.indexOf('<template>'), source.lastIndexOf('</template>'));
		// <XxxSettings/> を出現順に取り出し、コンポーネント名 -> セクション名に引き直す
		const rendered = [...template.matchAll(/<([A-Z][A-Za-z]*)Settings\s*\/>/g)]
			.map((m) => {
				const prefix = m[1].toLowerCase();
				return SECTION_MODULES.find((name) => name.replace(/^tempura-/, '').startsWith(prefix.slice(0, 4)));
			});

		assert.strictEqual(rendered.length, SECTION_MODULES.length, '全セクションが描画される');
		assert.strictEqual(rendered[1], 'tempura-privacy', 'プライバシーがプロフィールの次(2番目)に配置されている');
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
