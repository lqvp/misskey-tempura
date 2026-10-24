/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { action } from 'storybook/actions';
import { ref } from 'vue';
import MkCodeEditor from './MkCodeEditor.vue';
import type { StoryObj } from '@storybook/vue3';
const initialCode = `for (let i, 100) {
	<: if (i % 15 == 0) "FizzBuzz"
	elif (i % 3 == 0) "Fizz"
	elif (i % 5 == 0) "Buzz"
	else i
}`;
export const Default = {
	render(args) {
		return {
			components: {
				MkCodeEditor,
			},
			setup() {
				// SB10 では data() + v-model + computed events の組み合わせで
				// update:modelValue が反映されないため、setup の ref と明示的なハンドラで持つ
				const value = ref(initialCode);
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
			template: '<MkCodeEditor :model-value="value" v-bind="args" @update:model-value="onUpdateModelValue" />',
		};
	},
	args: {
		lang: 'aiscript',
	},
	parameters: {
		layout: 'fullscreen',
	},
	decorators: [
		() => ({
			template: '<div style="display: flex; align-items: center; justify-content: center; height: 100vh"><div style="max-width: 800px; width: 100%; margin: 3rem"><Suspense><story/></Suspense></div></div>',
		}),
	],
} satisfies StoryObj<typeof MkCodeEditor>;
