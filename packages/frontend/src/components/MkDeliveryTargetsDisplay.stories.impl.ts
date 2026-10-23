/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
 
import MkDeliveryTargetsDisplay from './MkDeliveryTargetsDisplay.vue';
import type { StoryObj } from '@storybook/vue3';
export const Include = {
	render(args) {
		return {
			components: {
				MkDeliveryTargetsDisplay,
			},
			setup() {
				return {
					args,
				};
			},
			template: '<MkDeliveryTargetsDisplay v-bind="args" />',
		};
	},
	args: {
		showing: true,
		mode: 'include',
		hosts: ['misskey-hub.net', 'misskey.example'],
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkDeliveryTargetsDisplay>;
export const Exclude = {
	...Include,
	args: {
		showing: true,
		mode: 'exclude',
		hosts: ['misskey.example'],
	},
} satisfies StoryObj<typeof MkDeliveryTargetsDisplay>;
