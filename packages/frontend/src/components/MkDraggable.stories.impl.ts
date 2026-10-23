/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { action } from 'storybook/actions';
import type { StoryObj } from '@storybook/vue3';
import MkDraggable from './MkDraggable.vue';
export const Default = {
	render(args) {
		return {
			components: {
				MkDraggable,
			},
			setup() {
				return {
					args,
				};
			},
			computed: {
				events() {
					return {
						'update:modelValue': action('update:modelValue'),
					};
				},
			},
			template: '<MkDraggable v-bind="args" v-on="events" style="width: 240px;"><template #default="{ item }"><div style="padding: 8px 16px; border: 1px solid var(--MI_THEME-divider, #ccc); border-radius: 8px;">{{ item.name }}</div></template></MkDraggable>',
		};
	},
	args: {
		modelValue: [
			{ id: 'a', name: 'Item A' },
			{ id: 'b', name: 'Item B' },
			{ id: 'c', name: 'Item C' },
		],
		direction: 'vertical',
	},
	parameters: {
		layout: 'centered',
	},
}
// NOTE: MkDraggable はジェネリックコンポーネントのため StoryObj<typeof ...> の satisfies が
// TS2322 になる。型注釈を付けず素のオブジェクトとして export する。
