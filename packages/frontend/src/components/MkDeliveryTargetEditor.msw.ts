/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { HttpResponse, http } from 'msw';
import { commonHandlers } from '../../.storybook/mocks.js';

// アイコンは Storybook にメディアプロキシがないため、プロキシ経由の画像リクエストにSVGを返す。
const iconSvg = (color: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${color}"/><circle cx="32" cy="32" r="14" fill="#fff" opacity="0.85"/></svg>`;

export const handlers = [
	...commonHandlers,
	http.post('/api/i/followers-servers', () => {
		return HttpResponse.json({
			servers: [
				{
					host: 'misskey.example',
					followersCount: 12,
					name: 'Misskey Example',
					faviconUrl: 'https://misskey.example/favicon.ico',
					iconUrl: null,
				},
				{
					host: 'long-hostname-for-wrapping-check.social.example',
					followersCount: 3,
					name: 'とても長い名前のサーバーの表示確認用サンプル',
					faviconUrl: null,
					iconUrl: 'https://long-hostname-for-wrapping-check.social.example/icon.png',
				},
				{
					host: 'noname.example',
					followersCount: 1,
					name: null,
					faviconUrl: null,
					iconUrl: null,
				},
			],
		});
	}),
	http.get(/\/preview\.webp$/, ({ request }) => {
		const target = new URL(request.url).searchParams.get('url') ?? '';
		const color = target.includes('misskey.example') ? '#86b300' : '#3b82f6';
		return new HttpResponse(iconSvg(color), {
			headers: {
				'Content-Type': 'image/svg+xml',
			},
		});
	}),
];
