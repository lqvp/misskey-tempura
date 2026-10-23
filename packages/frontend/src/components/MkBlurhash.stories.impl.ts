/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
 
import MkBlurhash from './MkBlurhash.vue';
import type { StoryObj } from '@storybook/vue3';
export const Default = {
	render(args) {
		return {
			components: {
				MkBlurhash,
			},
			setup() {
				return {
					args,
				};
			},
			template: '<div style="width: 300px; height: 300px;"><MkBlurhash v-bind="args" /></div>',
		};
	},
	args: {
		blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
		width: 300,
		height: 300,
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkBlurhash>;
