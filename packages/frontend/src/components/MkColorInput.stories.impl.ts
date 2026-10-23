/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
 
import { action } from 'storybook/actions';
import { ref } from 'vue';
import MkColorInput from './MkColorInput.vue';
import type { StoryObj } from '@storybook/vue3';
export const Default = {
	render(args) {
		return {
			components: {
				MkColorInput,
			},
			setup() {
				// SB10 では data() + v-model + computed events の組み合わせで
				// update:modelValue が反映されないため、setup の ref と明示的なハンドラで持つ
				const value = ref('#cccccc');
				const onUpdateModelValue = (v: string) => {
					value.value = v;
					action('update:modelValue')(v);
				};
				return {
					args,
					value,
					onUpdateModelValue,
				};
			},
			template: '<MkColorInput :model-value="value" v-bind="args" @update:model-value="onUpdateModelValue" />',
		};
	},
	parameters: {
		layout: 'fullscreen',
	},
	decorators: [
		() => ({
			template: '<div style="display: flex; align-items: center; justify-content: center; height: 100vh"><div style="max-width: 800px; width: 100%; margin: 3rem"><story/></div></div>',
		}),
	],
} satisfies StoryObj<typeof MkColorInput>;
