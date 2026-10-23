/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { action } from 'storybook/actions';
import type { StoryObj } from '@storybook/vue3';
import MkDeleteScheduleEditor from './MkDeleteScheduleEditor.vue';
export const Default = {
	render(args) {
		return {
			components: {
				MkDeleteScheduleEditor,
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
			template: '<MkDeleteScheduleEditor v-bind="args" v-on="events" />',
		};
	},
	args: {
		modelValue: {
			deleteAt: null,
			deleteAfter: 86400000,
			isValid: true,
			isScheduledForPrivate: false,
		},
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkDeleteScheduleEditor>;
