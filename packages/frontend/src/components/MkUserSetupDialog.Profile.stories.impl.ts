/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import MkUserSetupDialog_Profile from './MkUserSetupDialog.Profile.vue';
export const Default = {
	render(args) {
		return {
			components: {
				MkUserSetupDialog_Profile,
			},
			setup() {
				return {
					args,
				};
			},
			template: '<MkUserSetupDialog_Profile v-bind="args" />',
		};
	},
	args: {

	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkUserSetupDialog_Profile>;
