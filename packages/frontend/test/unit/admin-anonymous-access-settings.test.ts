/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, type RenderResult } from '@testing-library/vue';
import { directives } from '@/directives/index.js';
import { components } from '@/components/index.js';
import { i18n } from '@/i18n.js';
import XAnonymousAccessSettings from '@/pages/admin/tempura/sections/AnonymousAccessSettings.vue';

const { apiWithDialogMock, fetchInstanceMock } = vi.hoisted(() => ({
	apiWithDialogMock: vi.fn(),
	fetchInstanceMock: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/os.js', async (importOriginal) => ({
	...(await importOriginal() as Record<string, unknown>),
	apiWithDialog: apiWithDialogMock,
}));
vi.mock('@/instance.js', async (importOriginal) => ({
	...(await importOriginal() as Record<string, unknown>),
	fetchInstance: fetchInstanceMock,
}));
// グループ一括選択は保存ロジックの入力経路としてのみ必要なので、項目ボタンを並べる軽量スタブに差し替える
vi.mock('@/components/MkSelect.vue', async () => {
	const { h } = await import('vue');
	const stub = {
		name: 'MkSelectStub',
		props: ['modelValue', 'items'],
		emits: ['update:modelValue'],
		render(this: { items: { label: string; value: string }[]; $emit: (ev: string, v: unknown) => void }) {
			return h('div', {}, (this.items ?? []).map((item) =>
				h('button', { type: 'button', onClick: () => this.$emit('update:modelValue', item.value) }, item.label)));
		},
	};
	return new Proxy({}, {
		get(_t, key) {
			if (key === 'default') return stub;
			if (key === '__esModule') return true;
			return undefined;
		},
		has: () => true,
		ownKeys: () => ['default', '__esModule'],
		getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
	});
});
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

type Deferred = { promise: Promise<void>; resolve: () => void; reject: (e?: unknown) => void };
const deferred = (): Deferred => {
	let resolve!: () => void;
	let reject!: (e?: unknown) => void;
	const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
	return { promise, resolve, reject };
};

describe('管理画面の匿名アクセス設定の保存挙動', () => {
	let saveCalls: Deferred[] = [];

	const statsLabel = () => i18n.ts._serverSettings.allowAnonymousStats;
	const allOnLabel = () => i18n.ts._serverSettings.anonymousAccessGroupAllOn;

	const mountPage = async (): Promise<RenderResult> => {
		saveCalls = [];
		apiWithDialogMock.mockImplementation(() => {
			const d = deferred();
			saveCalls.push(d);
			return d.promise;
		});
		const page = render(XAnonymousAccessSettings, {
			props: { meta: {} as any },
			global: { directives, components },
		});
		const header = page.container.querySelector<HTMLElement>('[data-testid="folder-header"]');
		assert.exists(header, 'フォルダヘッダが存在する');
		await fireEvent.click(header!);
		return page;
	};

	// modelValue に追従するのは input ではなく data-testid="switch-toggle" の見た目側なのでそちらを観測する
	const findToggle = (page: RenderResult, label: string): HTMLElement => {
		const toggles = [...page.container.querySelectorAll<HTMLElement>('[data-testid="switch-toggle"]')];
		for (const toggle of toggles) {
			let node: HTMLElement | null = toggle;
			while (node && !(node.textContent ?? '').includes(label)) node = node.parentElement;
			if (node) return toggle;
		}
		throw new Error(`switch not found: ${label}`);
	};

	const isOn = (page: RenderResult, label: string): boolean =>
		findToggle(page, label).className.includes('buttonChecked');

	const waitSaveCalls = async (n: number): Promise<void> => {
		await vi.waitFor(() => assert.strictEqual(apiWithDialogMock.mock.calls.length, n));
	};

	afterEach(() => {
		cleanup();
		apiWithDialogMock.mockReset();
		fetchInstanceMock.mockReset();
	});

	test('保存成功後にインスタンス再取得だけが失敗しても、保存済みの値を戻さない', async () => {
		fetchInstanceMock.mockRejectedValue(new Error('network'));
		const page = await mountPage();
		assert.strictEqual(isOn(page, statsLabel()), false);
		await fireEvent.click(findToggle(page, statsLabel()));
		await waitSaveCalls(1);
		saveCalls[0].resolve();
		await vi.waitFor(() => assert.strictEqual(isOn(page, statsLabel()), true));
		expect(apiWithDialogMock).toHaveBeenCalledWith('admin/update-meta', { allowAnonymousStats: true });
	});

	test('保存に失敗した場合は保存確認済みの値に戻る', async () => {
		const page = await mountPage();
		await fireEvent.click(findToggle(page, statsLabel()));
		await waitSaveCalls(1);
		saveCalls[0].reject(new Error('save failed'));
		await vi.waitFor(() => assert.strictEqual(isOn(page, statsLabel()), false));
	});

	test('連続変更(ABA)が両方失敗した場合は確認値に戻る', async () => {
		const page = await mountPage();
		await fireEvent.click(findToggle(page, statsLabel())); // rev1: on
		await waitSaveCalls(1);
		await fireEvent.click(findToggle(page, statsLabel())); // rev2: off(キュー待ち)
		saveCalls[0].reject(new Error('f1'));
		await waitSaveCalls(2);
		saveCalls[1].reject(new Error('f2'));
		await vi.waitFor(() => assert.strictEqual(isOn(page, statsLabel()), false));
	});

	test('先の保存が失敗しても後の保存は継続され、後の値が残る', async () => {
		const page = await mountPage();
		await fireEvent.click(findToggle(page, statsLabel())); // rev1: on
		await waitSaveCalls(1);
		await fireEvent.click(findToggle(page, statsLabel())); // rev2: off(キュー待ち)
		saveCalls[0].reject(new Error('f1'));
		await waitSaveCalls(2);
		saveCalls[1].resolve();
		await vi.waitFor(() => assert.strictEqual(isOn(page, statsLabel()), false));
		expect(apiWithDialogMock).toHaveBeenNthCalledWith(2, 'admin/update-meta', { allowAnonymousStats: false });
	});

	test('同じ値への連続変更で先が失敗・後が成功しても画面とサーバーが一致する', async () => {
		const page = await mountPage();
		await fireEvent.click(findToggle(page, statsLabel())); // rev1: 個別 on
		await waitSaveCalls(1);
		// グループ一括 allOn で同じ true を再設定(rev2。同値のため値比較では世代を区別できない)
		await fireEvent.click(page.getAllByText(allOnLabel())[0]); // 1つ目=統計グループ
		saveCalls[0].reject(new Error('f1'));
		await waitSaveCalls(2);
		saveCalls[1].resolve();
		await vi.waitFor(() => assert.strictEqual(isOn(page, statsLabel()), true));
		expect(apiWithDialogMock).toHaveBeenNthCalledWith(2, 'admin/update-meta',
			expect.objectContaining({ allowAnonymousStats: true }));
	});
});
