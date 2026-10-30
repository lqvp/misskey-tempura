/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor, type RenderResult } from '@testing-library/vue';
import * as Misskey from 'misskey-js';
import { components } from '@/components/index.js';
import { directives } from '@/directives/index.js';
import MkTwitterEmbed from '@/components/MkTwitterEmbed.vue';
import MkMediaImage from '@/components/MkMediaImage.vue';
import MkMediaVideo from '@/components/MkMediaVideo.vue';
import { preferState } from '../setup.unit.js';

// FxTwitter API の実レスポンス構造に沿ったフィクスチャ
const fixture = {
	code: 200,
	tweet: {
		id: '1000000000000000001',
		id_str: '1000000000000000001',
		url: 'https://x.com/sampleuser/status/1000000000000000001',
		text: 'sample text',
		created_at: 'Fri Oct 30 12:00:00 +0000 2026',
		created_timestamp: 1761825600,
		author: {
			name: 'Sample User',
			screen_name: 'sampleuser',
			avatar_url: 'https://pbs.twimg.com/profile_images/1/avatar_normal.jpg',
		},
		media: {
			all: [
				{
					type: 'photo',
					url: 'https://pbs.twimg.com/media/AAAA.jpg',
					width: 800,
					height: 600,
				},
				{
					type: 'video',
					url: 'https://video.twimg.com/amplify_video/1/vid/640x360/BBBB.mp4?tag=1',
					thumbnail_url: 'https://pbs.twimg.com/amplify_video_thumb/1/img/CCCC.jpg',
					width: 640,
					height: 360,
				},
			],
		},
	},
};

// MkMediaList への引き渡し内容を検証するためスタブ化
const mediaListPropsList: { mediaList?: unknown[]; referrerpolicy?: string }[] = [];

vi.mock('@/components/MkMediaList.vue', () => ({
	default: {
		name: 'MkMediaList',
		props: ['mediaList', 'referrerpolicy'],
		setup(props: { mediaList: unknown[]; referrerpolicy?: string }) {
			mediaListPropsList.push({ mediaList: props.mediaList, referrerpolicy: props.referrerpolicy });
			return () => null;
		},
	},
}));

describe('MkTwitterEmbed', () => {
	afterEach(() => {
		cleanup();
		mediaListPropsList.length = 0;
	});

	const renderEmbed = async (): Promise<RenderResult> => {
		preferState.defaultFxTwitterEmbedProvider = 'fxtwitter.com';
		fetchMock.mockOnceIf((req) => {
			const url = new URL(req.url);
			return url.hostname === 'api.fxtwitter.com';
		}, () => {
			return {
				status: 200,
				body: JSON.stringify(fixture),
			};
		});
		const result = render(MkTwitterEmbed, {
			props: { tweetId: '1000000000000000001', screenName: 'sampleuser' },
			global: { directives, components },
		});
		await waitFor(() => {
			expect(result.queryByText('sample text')).not.toBeNull();
		});
		return result;
	};

	test('アバター画像は Referer を送らず直接 twimg から読み込む', async () => {
		const result = await renderEmbed();
		const avatar = result.container.querySelector<HTMLImageElement>('img[src="https://pbs.twimg.com/profile_images/1/avatar_normal.jpg"]');
		expect(avatar).not.toBeNull();
		expect(avatar!.getAttribute('referrerpolicy')).toBe('no-referrer');
	});

	test('添付メディアはプロキシを介さないURLのまま no-referrer 指定で MkMediaList に渡す', async () => {
		await renderEmbed();
		expect(mediaListPropsList.length).toBe(1);
		const passed = mediaListPropsList[0];
		expect(passed.referrerpolicy).toBe('no-referrer');
		const mediaList = passed.mediaList as Misskey.entities.DriveFile[];
		expect(mediaList).toHaveLength(2);
		expect(mediaList[0].url).toBe('https://pbs.twimg.com/media/AAAA.jpg');
		expect(mediaList[0].thumbnailUrl).toBe('https://pbs.twimg.com/media/AAAA.jpg');
		expect(mediaList[1].url).toBe('https://video.twimg.com/amplify_video/1/vid/640x360/BBBB.mp4?tag=1');
		expect(mediaList[1].thumbnailUrl).toBe('https://pbs.twimg.com/amplify_video_thumb/1/img/CCCC.jpg');
	});
});

describe('MkMediaImage referrerpolicy', () => {
	const renderMediaImage = (props: Record<string, unknown>): RenderResult => {
		return render(MkMediaImage, {
			props: {
				image: {
					id: 'xxxxxxxx',
					createdAt: (new Date()).toJSON(),
					isSensitive: false,
					name: 'example.png',
					thumbnailUrl: 'https://pbs.twimg.com/media/AAAA.jpg',
					url: 'https://pbs.twimg.com/media/AAAA.jpg',
					type: 'image/jpeg',
					size: 1,
					md5: '15eca7fba0480996e2245f5185bf39f2',
					blurhash: null,
					comment: null,
					properties: {},
				} as Misskey.entities.DriveFile,
				...props,
			},
			global: { directives, components },
		});
	};

	afterEach(() => {
		cleanup();
	});

	test('referrerpolicy 指定時は img 要素に属性が出る', async () => {
		const result = renderMediaImage({ referrerpolicy: 'no-referrer', controls: false });
		await waitFor(() => {
			const img = result.container.querySelector('img');
			expect(img).not.toBeNull();
			expect(img!.getAttribute('referrerpolicy')).toBe('no-referrer');
		});
	});

	test('referrerpolicy 未指定時は img 要素に属性が出ない (他呼び出しの既存挙動を維持)', async () => {
		const result = renderMediaImage({ controls: false });
		await waitFor(() => {
			const img = result.container.querySelector('img');
			expect(img).not.toBeNull();
			expect(img!.getAttribute('referrerpolicy')).toBeNull();
		});
	});
});

describe('MkMediaVideo referrerpolicy', () => {
	const renderMediaVideo = (props: Record<string, unknown>): RenderResult => {
		return render(MkMediaVideo, {
			props: {
				video: {
					id: 'xxxxxxxx',
					createdAt: (new Date()).toJSON(),
					isSensitive: false,
					name: 'example.mp4',
					thumbnailUrl: 'https://pbs.twimg.com/amplify_video_thumb/1/img/CCCC.jpg',
					url: 'https://video.twimg.com/amplify_video/1/vid/640x360/BBBB.mp4?tag=1',
					type: 'video/mp4',
					size: 1,
					md5: '15eca7fba0480996e2245f5185bf39f2',
					blurhash: null,
					comment: null,
					properties: {},
				} as Misskey.entities.DriveFile,
				...props,
			},
			global: { directives, components },
		});
	};

	afterEach(() => {
		cleanup();
	});

	test('referrerpolicy 指定時はサムネイル img 要素に属性が出る', async () => {
		const result = renderMediaVideo({ referrerpolicy: 'no-referrer' });
		await waitFor(() => {
			const img = result.container.querySelector('img');
			expect(img).not.toBeNull();
			expect(img!.getAttribute('referrerpolicy')).toBe('no-referrer');
		});
	});

	test('referrerpolicy 未指定時はサムネイル img 要素に属性が出ない (他呼び出しの既存挙動を維持)', async () => {
		const result = renderMediaVideo({});
		await waitFor(() => {
			const img = result.container.querySelector('img');
			expect(img).not.toBeNull();
			expect(img!.getAttribute('referrerpolicy')).toBeNull();
		});
	});
});
