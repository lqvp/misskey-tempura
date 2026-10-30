/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import MkTwitterEmbed from '@/components/MkTwitterEmbed.vue';

// FxTwitter API の実レスポンス構造に沿ったフィクスチャ
// (返信ツイート・ALT付き画像・動画の実サンプルがAPIから取得困難なため構造のみ再現)
const fixture = {
	code: 200,
	tweet: {
		id: '1000000000000000001',
		id_str: '1000000000000000001',
		url: 'https://x.com/sampleuser/status/1000000000000000001',
		text: 'sample text',
		created_at: 'Fri Oct 30 12:00:00 +0000 2026',
		author: {
			name: 'Sample User',
			screen_name: 'sampleuser',
			avatar_url: 'https://pbs.twimg.com/profile_images/1/avatar_normal.jpg',
		},
		replying_to: 'replytarget',
		replying_to_status: '9999999999999999999',
		media: {
			all: [
				{
					type: 'photo',
					url: 'https://pbs.twimg.com/media/AAAA.jpg',
					width: 800,
					height: 600,
					altText: '写真の代替テキスト',
				},
				{
					type: 'video',
					url: 'https://video.twimg.com/amplify_video/1/vid/640x360/BBBB.mp4?tag=1',
					thumbnail_url: 'https://pbs.twimg.com/amplify_video_thumb/1/img/CCCC.jpg',
					width: 640,
					height: 360,
					altText: '動画の代替テキスト',
				},
				{
					type: 'video',
					url: 'https://video.twimg.com/amplify_video/1/vid/640x360/DDDD.mp4?tag=1',
					width: 640,
					height: 360,
				},
			],
		},
	},
};

vi.mock('@/preferences.js', () => ({
	prefer: {
		s: {
			defaultFxTwitterEmbedProvider: 'fxtwitter.com',
		},
	},
}));

vi.mock('@/instance.js', () => ({
	instance: {
		mediaProxy: 'https://example.test/proxy',
	},
}));

// MkMediaList への引き渡し内容を検証するためスタブ化
const mediaListProps: { mediaList?: unknown[] } = {};

vi.mock('@/components/MkMediaList.vue', () => ({
	default: {
		name: 'MkMediaList',
		props: ['mediaList'],
		setup(props: { mediaList: unknown[] }) {
			mediaListProps.mediaList = props.mediaList;
			return () => null;
		},
	},
}));

// Mfm の重い描画を回避
vi.mock('@/components/MkMfm.vue', () => ({
	default: { name: 'Mfm', props: ['text'], setup: () => () => null },
}));

vi.stubGlobal('fetch', vi.fn(async () => ({
	ok: true,
	status: 200,
	json: async () => fixture,
})));

describe('MkTwitterEmbed', () => {
	afterEach(() => {
		cleanup();
		mediaListProps.mediaList = undefined;
	});

	test('返信先リンク・プロキシURL・ALTが反映される', async () => {
		const { container } = render(MkTwitterEmbed, {
			props: { screenName: 'sampleuser', tweetId: '1000000000000000001' },
		});
		let replyLink: HTMLAnchorElement | null = null;
		await waitFor(() => {
			replyLink = container.querySelector('a[href="https://twitter.com/replytarget/status/9999999999999999999"]');
			expect(replyLink).not.toBeNull();
		});
		expect(replyLink!.textContent).toContain('@replytarget');

		// アバターはプロキシ(avatar)経由
		const avatar = container.querySelector<HTMLImageElement>('img[alt="Sample User\'s avatar"]');
		expect(avatar?.src).toBe('https://example.test/proxy/image.webp?url=https%3A%2F%2Fpbs.twimg.com%2Fprofile_images%2F1%2Favatar_normal.jpg&fallback=1&avatar=1');

		// メディアが MkMediaList に渡される
		const media = mediaListProps.mediaList as { url: string; thumbnailUrl: string | null; comment: string | null; type: string }[];
		expect(media).toHaveLength(3);

		// 画像: URL/サムネイルはプロキシ経由、ALTがcommentに
		expect(media[0].url).toContain('https://example.test/proxy/image.webp?url=https%3A%2F%2Fpbs.twimg.com%2Fmedia%2FAAAA.jpg');
		expect(media[0].thumbnailUrl).toContain('https://example.test/proxy/preview.webp?url=');
		expect(media[0].comment).toBe('写真の代替テキスト');

		// 動画: 画像変換ルート(image.webp)ではなく生プロキシ経路
		expect(media[1].url).toContain('/proxy/?url=');
		expect(media[1].url).not.toContain('image.webp');
		expect(media[1].url).toContain(encodeURIComponent('https://video.twimg.com/amplify_video/1/vid/640x360/BBBB.mp4?tag=1'));
		expect(media[1].thumbnailUrl).toContain('https://example.test/proxy/preview.webp?url=');
		expect(media[1].comment).toBe('動画の代替テキスト');

		// サムネイルの無い動画: プロキシURLを生成せず thumbnailUrl は null
		expect(media[2].url).toContain('/proxy/?url=');
		expect(media[2].url).toContain(encodeURIComponent('https://video.twimg.com/amplify_video/1/vid/640x360/DDDD.mp4?tag=1'));
		expect(media[2].thumbnailUrl).toBeNull();
	});
});
