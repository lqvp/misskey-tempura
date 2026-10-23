/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { action } from 'storybook/actions';
import type { StoryObj } from '@storybook/vue3';
import MkSuspense from './MkSuspense.vue';
export const Default = {
	render(args) {
		return {
			components: {
				MkSuspense,
			},
			setup() {
				return {
					args,
					// Promise を返す関数は args (シリアライズされる) には乗せず setup 経由で渡す
					p: () => Promise.resolve({ message: 'Loaded content' }),
				};
			},
			computed: {
				events() {
					return {
						resolved: action('resolved'),
					};
				},
			},
			template: '<MkSuspense v-bind="args" :p="p" v-on="events"><template #default="{ result }">{{ result.message }}</template></MkSuspense>',
		};
	},
	args: {},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkSuspense>;
