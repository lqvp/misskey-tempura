/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, afterEach, assert, beforeAll, describe, test } from 'vitest';
import { cleanup, fireEvent, render, waitFor, type RenderResult } from '@testing-library/vue';
import type { SummalyResult } from '@misskey-dev/summaly';
import type { DetachedWindowAPI } from 'happy-dom';
import { components } from '@/components/index.js';
import { directives } from '@/directives/index.js';
import MkUrlPreview from '@/components/MkUrlPreview.vue';

const TWEET_ID = '1685072521782325249';
const FX_TWEET_RESPONSE = {
	code: 200,
	message: 'OK',
	tweet: {
		text: 'Fixture tweet body',
		author: {
			name: 'Fixture Author',
			screen_name: 'fixture',
			avatar_url: 'https://example.local/avatar.png',
		},
		created_timestamp: 1685072521,
		created_at: '2023-05-26T00:22:01.000Z',
		media: { all: [] },
		lang: 'en',
		url: `https://twitter.com/fixture/status/${TWEET_ID}`,
		source: '<a href="https://example.local">Misskey</a>',
		possibly_sensitive: false,
		is_note_tweet: false,
		community_note: null,
	},
} as const;

const happyDOM = (window as unknown as { happyDOM: DetachedWindowAPI }).happyDOM;
const originalIframeInterceptor = happyDOM.settings.fetch.interceptor;

const jsonResponse = (body: unknown) => ({
	status: 200,
	body: JSON.stringify(body),
});

describe('MkUrlPreview', () => {
	beforeAll(() => {
		// happy-dom loads iframe documents outside window.fetch. Keep those
		// navigations local while preserving the iframe attributes we assert.
		happyDOM.settings.fetch.interceptor = {
			beforeAsyncRequest: async ({ window: iframeWindow }) => new iframeWindow.Response(''),
		};
	});

	afterAll(() => {
		happyDOM.settings.fetch.interceptor = originalIframeInterceptor;
	});

	const renderPreviewBy = async (summary: Partial<SummalyResult>): Promise<RenderResult> => {
		const normalizedSummary: Partial<SummalyResult> = {
			...summary,
			title: summary.title ?? 'Mocked title',
			player: summary.player ?? {
				url: null,
				width: null,
				height: null,
				allow: [],
			},
		};

		fetchMock.mockResponse((request) => {
			const url = new URL(request.url);

			if (url.pathname === '/url') {
				return jsonResponse(normalizedSummary);
			}
			if (url.hostname === 'api.fxtwitter.com') {
				return jsonResponse(FX_TWEET_RESPONSE);
			}
			if (url.pathname === '/api/meta') {
				return jsonResponse({});
			}

			throw new Error(`Unexpected fetch request: ${request.url}`);
		});

		const result = render(MkUrlPreview, {
			props: { url: normalizedSummary.url! },
			global: { directives, components },
		});

		// Wait for the Summaly response to update the Vue tree before any
		// interaction or assertion; the initial render is still loading.
		await result.findByText(normalizedSummary.title!);
		return result;
	};

	const renderAndOpenPreview = async (summary: Partial<SummalyResult>): Promise<HTMLIFrameElement | null> => {
		const mkUrlPreview = await renderPreviewBy(summary);
		const buttons = await mkUrlPreview.findAllByRole('button');
		assert.isAtLeast(buttons.length, 1, 'player button should exist');
		await fireEvent.click(buttons[0]);
		await waitFor(() => {
			assert.exists(mkUrlPreview.container.querySelector('iframe'), 'iframe should exist');
		});

		return mkUrlPreview.container.querySelector('iframe');
	};

	afterEach(() => {
		cleanup();
		fetchMock.resetMocks();
	});

	test('Should render the description', async () => {
		const mkUrlPreview = await renderPreviewBy({
			url: 'https://example.local',
			description: 'Mocked description',
		});
		mkUrlPreview.getByText('Mocked description');
	});

	test('Having a player should render a button', async () => {
		const mkUrlPreview = await renderPreviewBy({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: null,
				allow: [],
			},
		});
		const buttons = await mkUrlPreview.findAllByRole('button');
		assert.strictEqual(buttons.length, 2, 'two buttons');
	});

	test('Having a player should setup the iframe', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: null,
				allow: [],
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.src, 'https://example.local/player?autoplay=1&auto_play=1');
		assert.strictEqual(
			iframe?.sandbox.toString(),
			'allow-popups allow-popups-to-escape-sandbox allow-scripts allow-storage-access-by-user-activation allow-same-origin',
		);
	});

	test('Having a player with `allow` field should set permissions', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: null,
				allow: ['fullscreen', 'web-share'],
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.allow, 'fullscreen;web-share');
	});

	test('A Summaly proxy response without allow falls back to the default', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: null,
				allow: undefined as any,
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.allow, 'autoplay;encrypted-media;fullscreen');
	});

	test('Filtering the allow list from the Summaly proxy', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: null,
				allow: ['autoplay', 'camera', 'fullscreen'],
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.allow, 'autoplay;fullscreen');
	});

	test('Having a player width should keep the fixed aspect ratio', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: 400,
				height: 200,
				allow: [],
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.parentElement?.style.paddingTop, '50%');
	});

	test('Having a player width should keep the fixed height', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: 200,
				allow: [],
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.parentElement?.style.paddingTop, '200px');
	});

	for (const [network, url] of [
		['Twitter', `https://twitter.com/fixture/status/${TWEET_ID}`],
		['X', `https://x.com/fixture/status/${TWEET_ID}`],
	] as const) {
		test(`Loading a ${network} post renders the current FxTwitter embed`, async () => {
			const mkUrlPreview = await renderPreviewBy({ url });
			const expandButton = await mkUrlPreview.findByRole('button');
			await fireEvent.click(expandButton);

			await mkUrlPreview.findByText('Fixture Author');
			assert.isNull(mkUrlPreview.container.querySelector('iframe'));
			assert.isTrue(fetchMock.requests().some(request => request.url === `https://api.fxtwitter.com/fixture/status/${TWEET_ID}`));
		});
	}
});
