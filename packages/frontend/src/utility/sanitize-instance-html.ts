/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import sanitizeHtml from 'sanitize-html';

/**
 * インスタンスの管理者が設定した説明文・サーバールールなど、
 * サーバーから配信される HTML 文字列を v-html に渡す前にサニタイズする。
 * 設定ミスや管理画面経由での XSS を多層防御として防ぐ。
 */
export function sanitizeInstanceHtml(html: string | null | undefined): string {
	if (html == null) return '';
	return sanitizeHtml(html, {
		allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
		allowedAttributes: {
			...sanitizeHtml.defaults.allowedAttributes,
			img: ['src', 'srcset', 'alt', 'title', 'width', 'height'],
			a: ['href', 'title', 'target', 'rel'],
		},
		// タグ横断では data: を許可しない(a href="data:..." の回避策)。
		// data: は img に限定して許可する
		allowedSchemes: ['http', 'https'],
		allowedSchemesByTag: {
			img: ['http', 'https', 'data'],
		},
		transformTags: {
			a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
		},
	});
}
