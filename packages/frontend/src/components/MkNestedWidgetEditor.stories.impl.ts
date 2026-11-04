/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { ref } from 'vue';
import type { StoryObj } from '@storybook/vue3';
import MkNestedWidgetEditor from './MkNestedWidgetEditor.vue';
export const Default = {
	render(args) {
		return {
			components: { MkNestedWidgetEditor },
			setup() { return { widgets: ref(args.modelValue) }; },
			template: '<MkNestedWidgetEditor v-model="widgets"/>',
		};
	},
	args: { modelValue: [{ id: 'clock', name: 'clock', data: {} }, { id: 'calendar', name: 'calendar', data: {} }] },
} satisfies StoryObj<typeof MkNestedWidgetEditor>;
export const Empty = { ...Default, args: { modelValue: [] } } satisfies StoryObj<typeof MkNestedWidgetEditor>;
