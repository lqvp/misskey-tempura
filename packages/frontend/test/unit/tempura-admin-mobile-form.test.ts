/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { directives } from '@/directives/index.js';
import { components } from '@/components/index.js';
import { i18n } from '@/i18n.js';
import { updateDeviceKind } from '@/utility/device-kind.js';
import ModerationCategory from '@/pages/admin/tempura/categories/ModerationCategory.vue';
import { preferState } from '../setup.unit.js';

type PopupRecord = {
	pageId: number;
	container: HTMLDivElement;
	close: () => void;
};

const { apiWithDialogMock, fetchInstanceMock, apiMock, popupMock, activePopups } = vi.hoisted(() => {
	const popups: PopupRecord[] = [];
	return {
		apiWithDialogMock: vi.fn(() => Promise.resolve({})),
		fetchInstanceMock: vi.fn(() => Promise.resolve()),
		apiMock: vi.fn(() => Promise.resolve({})),
		activePopups: popups,
		popupMock: vi.fn(async (_component: unknown, props: { pageId?: number }, events?: { closed?: () => void }) => {
			const pageId = props?.pageId ?? 0;
			const container = document.createElement('div');
			container.setAttribute('data-folder-page-id', String(pageId));
			const headerEl = document.createElement('div');
			headerEl.id = `v-${pageId}-header`;
			const bodyEl = document.createElement('div');
			bodyEl.id = `v-${pageId}-body`;
			container.append(headerEl, bodyEl);
			document.body.appendChild(container);

			const dispose = () => {
				container.remove();
			};
			const record: PopupRecord = {
				pageId,
				container,
				close: () => {
					events?.closed?.();
				},
			};
			popups.push(record);
			return { dispose };
		}),
	};
});

vi.mock('@/os.js', async (importOriginal) => ({
	...(await importOriginal() as Record<string, unknown>),
	apiWithDialog: apiWithDialogMock,
	popup: popupMock,
}));
vi.mock('@/instance.js', async (importOriginal) => ({
	...(await importOriginal() as Record<string, unknown>),
	fetchInstance: fetchInstanceMock,
}));
vi.mock('@/utility/misskey-api.js', async (importOriginal) => ({
	...(await importOriginal() as Record<string, unknown>),
	misskeyApi: apiMock,
}));
// v-panel / MkFolder が参照するコンパイル済みテーマの最小モック
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

describe('テンプラ管理画面 モバイル実フォーム再保存回帰テスト', () => {
	afterEach(() => {
		cleanup();
		for (const p of activePopups.splice(0)) {
			p.container.remove();
		}
		apiWithDialogMock.mockClear();
		fetchInstanceMock.mockClear();
		apiMock.mockClear();
		popupMock.mockClear();
		updateDeviceKind(null);
		preferState['experimental.enableFolderPageView'] = false;
	});

	test('スマートフォン＋フォルダーページ表示有効でカテゴリを開き直してから実フォームの別項目を保存しても先の変更が上書きされない', async () => {
		updateDeviceKind('smartphone');
		preferState['experimental.enableFolderPageView'] = true;

		const page = render(ModerationCategory, {
			props: {
				meta: {
					blockMentionsFromUnfamiliarRemoteUsers: false,
					enableContactForm: false,
					contactFormLimit: 5,
					contactFormRequireAuth: false,
				} as any,
			},
			global: { directives, components },
		});

		const categoryRoot = page.container.querySelector<HTMLElement>('[role="group"]');
		assert.exists(categoryRoot);
		const categoryHeader = categoryRoot!.querySelector<HTMLElement>('[data-testid="folder-header"]');
		assert.exists(categoryHeader);

		// 1. 外側カテゴリを開く（:canPage="false" によりポップアップではなくインライン展開される）
		await fireEvent.click(categoryHeader!);
		await vi.waitFor(() => expect(categoryRoot!.getAttribute('aria-expanded')).toBe('true'));
		expect(popupMock).not.toHaveBeenCalled();

		// 2. 実フォーム（お問い合わせフォーム設定）を開き、有効化して保存
		const contactHeader = [...page.container.querySelectorAll<HTMLElement>('[data-testid="folder-header"]')]
			.find((el) => (el.textContent ?? '').includes(i18n.ts._contactForm._settings.title));
		assert.exists(contactHeader, 'お問い合わせフォーム設定のフォルダが存在する');

		await fireEvent.click(contactHeader!);
		const firstPopup = await vi.waitFor(() => {
			assert.isAbove(activePopups.length, 0);
			return activePopups[activePopups.length - 1];
		});

		const enableSwitch = await vi.waitFor(() => {
			const toggles = [...firstPopup.container.querySelectorAll<HTMLElement>('[data-testid="switch-toggle"]')];
			const found = toggles.find((toggle) => {
				let node: HTMLElement | null = toggle;
				while (node && !(node.textContent ?? '').includes(i18n.ts._contactForm._settings.enable)) node = node.parentElement;
				return node != null;
			});
			assert.exists(found, 'お問い合わせフォーム有効スイッチが存在する');
			return found!;
		});
		await fireEvent.click(enableSwitch);

		const saveButton1 = await vi.waitFor(() => {
			const btn = [...firstPopup.container.querySelectorAll<HTMLButtonElement>('button')]
				.find((b) => (b.textContent ?? '').includes(i18n.ts.save));
			assert.exists(btn, '保存ボタンが表示される');
			return btn!;
		});
		await fireEvent.click(saveButton1);

		await vi.waitFor(() => {
			expect(apiWithDialogMock).toHaveBeenCalledWith('admin/update-meta', {
				enableContactForm: true,
				contactFormLimit: 5,
				contactFormRequireAuth: false,
			});
		});

		// 3. お問い合わせフォームページと外側カテゴリを閉じ、外側カテゴリ・お問い合わせフォームを開き直す
		firstPopup.close();
		await fireEvent.click(categoryHeader!);
		await vi.waitFor(() => expect(categoryRoot!.getAttribute('aria-expanded')).toBe('false'));
		await fireEvent.click(categoryHeader!);
		await vi.waitFor(() => expect(categoryRoot!.getAttribute('aria-expanded')).toBe('true'));

		await fireEvent.click(contactHeader!);
		const secondPopup = await vi.waitFor(() => {
			assert.isAtLeast(activePopups.length, 2);
			return activePopups[activePopups.length - 1];
		});

		// 4. 受付件数の上限だけを変更して再保存 → 先に保存した enableContactForm: true が維持されること
		const limitInput = await vi.waitFor(() => {
			const input = secondPopup.container.querySelector<HTMLInputElement>('input[type="number"]');
			assert.exists(input, '受付件数上限の入力欄が存在する');
			return input!;
		});
		await fireEvent.update(limitInput, '8');

		const saveButton2 = await vi.waitFor(() => {
			const btn = [...secondPopup.container.querySelectorAll<HTMLButtonElement>('button')]
				.find((b) => (b.textContent ?? '').includes(i18n.ts.save));
			assert.exists(btn, '再保存ボタンが表示される');
			return btn!;
		});
		await fireEvent.click(saveButton2);

		await vi.waitFor(() => {
			expect(apiWithDialogMock).toHaveBeenLastCalledWith('admin/update-meta', {
				enableContactForm: true,
				contactFormLimit: 8,
				contactFormRequireAuth: false,
			});
		});
	});
});
