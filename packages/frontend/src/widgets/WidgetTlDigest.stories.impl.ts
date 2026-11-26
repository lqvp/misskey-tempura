/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import { provide, ref } from 'vue';
import type { StoryObj } from '@storybook/vue3';
import {
	TL_DIGEST_CONTROLLER_KEY,
} from '@/utility/tempura-script/tl-digest/digest.js';
import type {
	TlDigestController,
	TlDigestError,
	TlDigestPendingCount,
	TlDigestResult,
	TlDigestWindow,
} from '@/utility/tempura-script/tl-digest/digest.js';
import WidgetTlDigest from './WidgetTlDigest.vue';
import { handlers as tlDigestHandlers } from './WidgetTlDigest.msw.js';

type StoryState = 'idle' | 'pending' | 'pendingCounting' | 'pendingError' | 'generating' | 'result' | 'error';
type Story = StoryObj<typeof WidgetTlDigest>;

const PENDING_SINCE = Date.UTC(2026, 10, 24, 6, 15);
const PENDING_UNTIL = Date.UTC(2026, 10, 24, 8, 30);

const SAMPLE_RESULT: TlDigestResult = {
	topics: [
		{
			title: 'Storybook 10 の移行と動作確認',
			summary: 'Storybook 10 へ更新したあとの起動手順と表示確認について活発に情報が交わされました。MSW を使った API モックの事例も共有されています。',
			noteIds: ['story-result-1', 'story-result-2'],
			refs: [
				{ seqId: 'n1', noteId: 'story-result-1', username: '@haru' },
				{ seqId: 'n2', noteId: 'story-result-2', username: '@mio' },
			],
		},
		{
			title: '秋の写真と近所の散歩',
			summary: '色づいた並木道や公園の写真が投稿され、散歩におすすめの場所についての返信が集まりました。',
			noteIds: ['story-result-3', 'story-result-4'],
			refs: [
				{ seqId: 'n3', noteId: 'story-result-3', username: '@sora' },
				{ seqId: 'n4', noteId: 'story-result-4', username: '@yuki' },
			],
		},
		{
			title: '週末の料理チャレンジ',
			summary: '新作パスタとスープのレシピが話題になり、味付けの工夫や代用できる材料が紹介されました。',
			noteIds: ['story-result-5'],
			refs: [
				{ seqId: 'n5', noteId: 'story-result-5', username: '@aoi' },
			],
		},
	],
	fallbackText: null,
	noteCount: 42,
	generatedAt: Date.UTC(2026, 10, 24, 9, 30),
	since: PENDING_SINCE,
	until: PENDING_UNTIL,
};

function createStoryController(state: StoryState): TlDigestController {
	const result = ref<TlDigestResult | null>(state === 'result' ? SAMPLE_RESULT : null);
	const generating = ref<boolean>(state === 'generating');
	const error = ref<TlDigestError | null>(
		state === 'error'
			? { message: 'OpenAI互換APIのAPIキーが設定されていません。設定画面から設定してください。', isConfigError: true }
			: null,
	);
	const pendingCount = ref<TlDigestPendingCount>(
		state === 'pending'
			? { status: 'ready', count: 12, truncated: false }
			: state === 'pendingCounting'
				? { status: 'counting' }
				: state === 'pendingError'
					? { status: 'error' }
					: { status: 'idle' },
	);

	const hasPending = state === 'pending' || state === 'pendingCounting' || state === 'pendingError';
	const pendingWindow = ref<TlDigestWindow | null>(
		hasPending ? { since: PENDING_SINCE, until: PENDING_UNTIL } : null,
	);

	return {
		result,
		generating,
		error,
		pendingCount,
		pendingWindow,
		refreshPendingCount: async () => pendingCount.value,
		resetPendingCount: () => {},
		run: async () => {},
		runRecent: async () => {},
		retry: async () => {},
		cancel: () => {
			generating.value = false;
		},
		clear: () => {
			result.value = null;
			error.value = null;
		},
		dispose: () => {},
	};
}

function createStory(state: StoryState) {
	return {
		render(args) {
			return {
				components: { WidgetTlDigest },
				setup() {
					provide(TL_DIGEST_CONTROLLER_KEY, createStoryController(state));
					return { args };
				},
				template: '<div style="width: min(360px, calc(100vw - 32px)); max-width: 100%;"><WidgetTlDigest v-bind="args" /></div>',
			};
		},
		args: {
			widget: {
				id: `tl-digest-story-${state}`,
				data: {
					showHeader: true,
					transparent: false,
					absenceThreshold: '60',
					maxNotes: '100',
					includeRenotes: true,
					autoGenerate: false,
				},
			},
		},
		parameters: {
			layout: 'centered',
			msw: {
				handlers: tlDigestHandlers,
			},
		},
	} satisfies Story;
}

export const Idle = createStory('idle');
export const Pending = createStory('pending');
export const PendingCounting = createStory('pendingCounting');
export const PendingError = createStory('pendingError');
export const Generating = createStory('generating');
export const Result = createStory('result');
export const ErrorState = createStory('error');
