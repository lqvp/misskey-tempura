/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { action } from 'storybook/actions';
import type { StoryObj } from '@storybook/vue3';
import MkCheckbox from './MkCheckbox.vue';
export const Default = {
	render(args) {
		return {
			components: {
				MkCheckbox,
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
			template: '<MkCheckbox v-bind="args" v-on="events">Label</MkCheckbox>',
		};
	},
	args: {
		modelValue: [],
		value: 'option1',
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkCheckbox>;
export const Checked = {
	...Default,
	args: {
		modelValue: ['option1'],
		value: 'option1',
	},
} satisfies StoryObj<typeof MkCheckbox>;
