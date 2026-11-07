/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { directives } from '@/directives/index.js';
import { components } from '@/components/index.js';
import MkKeywordGroupsInput from '@/components/MkKeywordGroupsInput.vue';

afterEach(() => cleanup());

function mount(regexMode: boolean) {
	let captured: string[][] | null = null;
	const page = render(MkKeywordGroupsInput, {
		props: {
			modelValue: [[]],
			regexMode,
			'onUpdate:modelValue': (v: string[][]) => { captured = v; },
		},
		global: { directives, components },
	});
	const input = page.container.querySelector('textarea, input')!;
	return { page, input, getCaptured: () => captured };
}

describe('MkKeywordGroupsInput', () => {
	test('literal モードでは空白区切りで AND 分割する (従来動作)', async () => {
		const { input, getCaptured } = mount(false);
		await fireEvent.update(input, 'foo  bar');
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(getCaptured()).toEqual([['foo', 'bar']]);
	});

	test('regex モードでは空白・| を含む入力を1項目として保持する (trim も分割もしない)', async () => {
		const { input, getCaptured } = mount(true);
		expect(input.tagName).toBe('TEXTAREA');
		await fireEvent.update(input, ' foo | bar ');
		await fireEvent.blur(input);
		expect(getCaptured()).toEqual([[' foo | bar ']]);
	});

	test('regex モードでは改行を含む式を入力・保持できる (Enter が改行になる)', async () => {
		const { input, getCaptured } = mount(true);
		expect(input.tagName).toBe('TEXTAREA');
		await fireEvent.update(input, '円\n次');
		await fireEvent.blur(input);
		expect(getCaptured()).toEqual([['円\n次']]);
	});

	test('literal モードの入力欄は input のまま', () => {
		const { input } = mount(false);
		expect(input.tagName).toBe('INPUT');
	});

	test('regex モードの入力欄は 512 文字までに制限される', () => {
		const { input } = mount(true);
		expect(input.getAttribute('maxlength')).toBe('512');
	});

	test('blur で確定した後に + ボタンを押しても二重に追加されない', async () => {
		let captured: string[][] | null = null;
		const page = render(MkKeywordGroupsInput, {
			props: {
				modelValue: [[]],
				regexMode: true,
				'onUpdate:modelValue': (v: string[][]) => { captured = v; },
			},
			global: { directives, components },
		});
		const input = page.container.querySelector('textarea')!;
		await fireEvent.update(input, 'foo');
		await fireEvent.blur(input);
		expect(captured).toEqual([['foo']]);

		// blur の後は入力欄が空なので、+ を押しても追加されない
		const plus = page.container.querySelector('button[class*="button"]')!;
		await fireEvent.click(plus);
		expect(captured).toEqual([['foo']]);
	});

	test('モードを切り替えると、入力中の内容は切替前のモードで確定される', async () => {
		// regexモードで "foo bar" を入力中に literal へ切り替えると、
		// 切替後のモードで分割されてしまうとユーザーの意図と違う条件になる
		let captured: string[][] | null = null;
		const page = render(MkKeywordGroupsInput, {
			props: {
				modelValue: [[]],
				regexMode: true,
				'onUpdate:modelValue': (v: string[][]) => { captured = v; },
			},
			global: { directives, components },
		});
		const ta = page.container.querySelector('textarea')!;
		await fireEvent.update(ta, 'foo bar');
		// 切替前のモード (regex) で1項目として確定される
		await page.rerender({ modelValue: captured ?? [[]], regexMode: false, 'onUpdate:modelValue': (v: string[][]) => { captured = v; } });
		expect(captured).toEqual([['foo bar']]);
	});

	test('regex モードのチップは改行を空白に畳まずに表示する', async () => {
		const page = render(MkKeywordGroupsInput, {
			props: {
				modelValue: [['円\n次']],
				regexMode: true,
				'onUpdate:modelValue': () => {},
			},
			global: { directives, components },
		});
		const chipText = page.container.querySelector('[class*="chipText"]')!;
		expect(chipText.textContent).toBe('円\n次');
		// 生の値は title でも確認できる
		expect(chipText.closest('[title]')?.getAttribute('title')).toBe('円\n次');
	});
});
