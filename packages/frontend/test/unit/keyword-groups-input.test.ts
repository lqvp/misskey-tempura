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
	const input = page.container.querySelector('input')!;
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
		await fireEvent.update(input, ' foo | bar ');
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(getCaptured()).toEqual([[' foo | bar ']]);
	});
});
