/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import { action } from 'storybook/actions';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ref } from 'vue';
import { file } from '../../.storybook/fakes.js';
import MkCwButton from './MkCwButton.vue';
import { i18n } from '@/i18n.js';

export const Default = {
	render(args) {
		return {
			components: {
				MkCwButton,
			},
			setup() {
				// SB10 では data() + v-model + computed events の組み合わせで
				// update:modelValue が反映されないため、setup の ref と明示的なハンドラで持つ
				const showContent = ref(false);
				const onUpdateModelValue = (v: boolean) => {
					showContent.value = v;
					action('update:modelValue')(v);
				};
				return {
					args,
					showContent,
					onUpdateModelValue,
				};
			},
			template: '<MkCwButton :model-value="showContent" v-bind="args" @update:model-value="onUpdateModelValue" />',
		};
	},
	args: {
		text: 'Some CW content',
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const buttonElement = canvas.getByRole<HTMLButtonElement>('button');
		await expect(buttonElement).toHaveTextContent(i18n.ts._cw.show);
		await expect(buttonElement).toHaveTextContent(i18n.tsx._cw.chars({ count: 15 }));
		await userEvent.click(buttonElement);
		// クリック後の再レンダリング反映待ち。capture 環境では flush が遅れて flaky になるため waitFor でリトライする
		await waitFor(() => expect(buttonElement).toHaveTextContent(i18n.ts._cw.hide));
		await userEvent.click(buttonElement);
	},
	parameters: {
		chromatic: {
			// NOTE: テストが終わるまで待つ
			delay: 5000,
		},
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkCwButton>;
export const IncludesTextAndDriveFile = {
	...Default,
	args: {
		text: 'Some CW content',
		files: [file()],
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const buttonElement = canvas.getByRole<HTMLButtonElement>('button');
		await expect(buttonElement).toHaveTextContent(i18n.tsx._cw.chars({ count: 15 }));
		await expect(buttonElement).toHaveTextContent(' / ');
		await expect(buttonElement).toHaveTextContent(i18n.tsx._cw.files({ count: 1 }));
	},
} satisfies StoryObj<typeof MkCwButton>;
