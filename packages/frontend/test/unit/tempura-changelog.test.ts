/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import XTempuraChangelog from '@/pages/tempura-changelog.vue';
import { i18n } from '@/i18n.js';

const { popupMenu } = vi.hoisted(() => ({ popupMenu: vi.fn() }));
vi.mock('@/os.js', () => ({ popupMenu }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	popupMenu.mockReset();
});

describe('feature guide category selection', () => {
	test.each([false, true])('clears search when selecting all categories (all selected before search: %s)', async (selectAllFirst) => {
		vi.spyOn(window, 'fetch').mockResolvedValue(new Response('# Guide\n## First\n* Needle\n## Second\n* Other'));
		const page = render(XTempuraChangelog, {
			global: {
				stubs: {
					PageWithHeader: { template: '<div><slot/></div>' },
					MkLoading: true,
					MkError: true,
					Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
				},
				directives: { 'adaptive-border': {} },
			},
		});
		await page.findByRole('heading', { name: 'First' });
		const picker = page.container.querySelector<HTMLElement>('nav [tabindex="0"]')!;
		const chooseAll = async () => {
			// Keep the real MkSelect and its defineModel same-value handling; only replace popup rendering.
			await fireEvent.keyDown(picker, { key: 'Enter' });
			const menu = popupMenu.mock.lastCall?.[0] as { text?: string; action?: () => void }[];
			const all = menu.find(item => item.text === i18n.ts._misskeyTempura._changelog.allCategories);
			expect(all?.action).toBeTypeOf('function');
			all!.action!();
			popupMenu.mock.lastCall?.[2].onClosing();
			await nextTick();
		};
		if (selectAllFirst) await chooseAll();
		const search = page.getByRole('searchbox') as HTMLInputElement;
		await fireEvent.update(search, 'Needle');
		expect(page.queryByRole('heading', { name: 'Second' })).toBeNull();
		await chooseAll();
		expect(search.value).toBe('');
		expect(page.getByRole('heading', { name: 'Second' })).toBeTruthy();
	});
});
