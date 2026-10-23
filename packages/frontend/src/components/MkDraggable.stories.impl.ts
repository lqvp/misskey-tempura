/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { action } from 'storybook/actions';
import MkDraggable from './MkDraggable.vue';
// NOTE: MkDraggable はジェネリックコンポーネントのため StoryObj 系の型注釈/satisfies が
// TS2322 になる。素のオブジェクトとして export し、render の args に明示的な型を付ける。
export const Default = {
	render(args: { modelValue: { id: string; name: string }[]; direction: string }) {
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
};
