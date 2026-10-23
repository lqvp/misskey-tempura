/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
 
import MkSystemIcon from './MkSystemIcon.vue';
import type { StoryObj } from '@storybook/vue3';
export const Info = {
	render(args) {
		return {
			components: {
				MkSystemIcon,
			},
			setup() {
				return {
					args,
				};
			},
			template: '<MkSystemIcon v-bind="args" />',
		};
	},
	args: {
		type: 'info',
	},
	parameters: {
		layout: 'centered',
		chromatic: {
			// アイコンの描画アニメーションが完了した状態でキャプチャする (SB10)
			pauseAnimationAtEnd: true,
		},
	},
	decorators: [
		// svg には viewBox しかなく、利用側がサイズを与える前提のため (MkDialog 等と同様に) ストーリー側で明示する
		() => ({
			template: '<div style="width: 128px; height: 128px;"><story/></div>',
		}),
	],
} satisfies StoryObj<typeof MkSystemIcon>;
export const Question = {
	...Info,
	args: {
		type: 'question',
	},
} satisfies StoryObj<typeof MkSystemIcon>;
export const Success = {
	...Info,
	args: {
		type: 'success',
	},
} satisfies StoryObj<typeof MkSystemIcon>;
export const Warn = {
	...Info,
	args: {
		type: 'warn',
	},
} satisfies StoryObj<typeof MkSystemIcon>;
export const Error = {
	...Info,
	args: {
		type: 'error',
	},
} satisfies StoryObj<typeof MkSystemIcon>;
export const Waiting = {
	...Info,
	args: {
		type: 'waiting',
	},
} satisfies StoryObj<typeof MkSystemIcon>;
