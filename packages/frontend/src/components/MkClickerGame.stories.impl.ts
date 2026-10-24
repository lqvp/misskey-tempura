/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { HttpResponse, http } from 'msw';
import { action } from 'storybook/actions';
import { expect, userEvent, within } from 'storybook/test';
import { commonHandlers } from '../../.storybook/mocks.js';
import MkClickerGame from './MkClickerGame.vue';
import type { StoryObj } from '@storybook/vue3';

function sleep(ms: number) {
	return new Promise(resolve => window.setTimeout(resolve, ms));
}

export const Default = {
	render(args) {
		return {
			components: {
				MkClickerGame,
			},
			setup() {
				return {
					args,
				};
			},
			template: '<MkClickerGame v-bind="args" />',
		};
	},
	decorators: [
		// capture の安定化: アニメーション/トランジションを即時完了させる (表示内容自体は変えない)
		() => ({
			template: '<div><style>*, *::before, *::after { animation-duration: 0.01s !important; animation-delay: 0s !important; transition-duration: 0.01s !important; transition-delay: 0s !important; }</style><story/></div>',
		}),
	],
	async play({ canvasElement }) {
		await sleep(1000);
		const canvas = within(canvasElement);
		const count = canvas.getByTestId('count');
		await expect(count).toHaveTextContent('0');
		const buttonElement = canvas.getByRole<HTMLButtonElement>('button');
		await userEvent.click(buttonElement);
		await expect(count).toHaveTextContent('1');
	},
	parameters: {
		chromatic: {
			// NOTE: cps カウンタや +1 エフェクトが時間経過で変化するため、
			// アニメーションを無効化する decorator と併用した上で十分に待ってから capture する
			delay: 8000,
		},
		layout: 'centered',
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/i/registry/get', async ({ request }) => {
					action('POST /api/i/registry/get')(await request.json());
					return HttpResponse.json({
						error: {
							message: 'No such key.',
							code: 'NO_SUCH_KEY',
							id: 'ac3ed68a-62f0-422b-a7bc-d5e09e8f6a6a',
						},
					}, {
						status: 400,
					});
				}),
				http.post('/api/i/registry/set', async ({ request }) => {
					action('POST /api/i/registry/set')(await request.json());
					return HttpResponse.json(undefined, { status: 204 });
				}),
				http.post('/api/i/claim-achievement', async ({ request }) => {
					action('POST /api/i/claim-achievement')(await request.json());
					return HttpResponse.json(undefined, { status: 204 });
				}),
			],
		},
	},
} satisfies StoryObj<typeof MkClickerGame>;
