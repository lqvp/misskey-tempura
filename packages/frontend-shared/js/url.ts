/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { toUnicode as decodePunycode } from 'punycode.js';

/* objを検査して
 * 1. 配列に何も入っていない時はクエリを付けない
 * 2. プロパティがundefinedの時はクエリを付けない
 * （new URLSearchParams(obj)ではそこまで丁寧なことをしてくれない）
 */
export function query(obj: Record<string, string | number | boolean>): string {
	const params = Object.entries(obj)
		.filter(([, v]) => Array.isArray(v) ? v.length : v !== undefined) // eslint-disable-line @typescript-eslint/no-unnecessary-condition
		.reduce<Record<string, string | number | boolean>>((a, [k, v]) => (a[k] = v, a), {});

	return Object.entries(params)
		.map((p) => `${p[0]}=${encodeURIComponent(p[1])}`)
		.join('&');
}

export function appendQuery(url: string, queryString: string): string {
	return `${url}${/\?/.test(url) ? url.endsWith('?') ? '' : '&' : '?'}${queryString}`;
}

export function extractDomain(url: string) {
	const match = url.match(/^(?:https?:)?(?:\/\/)?(?:[^@\n]+@)?([^:\/\n]+)/im);
	return match ? match[1] : null;
}

export function tryParseUrl(url: string | URL, base?: string | URL): URL | null {
	try {
		return new URL(url, base);
	} catch {
		return null;
	}
}

/**
 * http(s) スキームの絶対URLのみを返す。それ以外（javascript:, data: など）は null を返す。
 * 外部サービスから取得したURLをそのまま href にバインドする前の検証に使う。
 */
export function safeHttpUrl(url: string | null | undefined): string | null {
	if (url == null) return null;

	const parsed = tryParseUrl(url);
	if (parsed == null) return null;
	if (!['http:', 'https:'].includes(parsed.protocol)) return null;
	// userinfo 付きの URL は外部リンクとして紛らわしいので許可しない
	if (parsed.username !== '' || parsed.password !== '') return null;

	return parsed.href;
}

export function maybeMakeRelative(urlStr: string, baseStr: string): string {
	try {
		const baseObj = new URL(baseStr);
		const urlObj = new URL(urlStr);
		/* in all places where maybeMakeRelative is used, baseStr is the
		 * instance's public URL, which can't have path components, so the
		 * relative URL will always have the whole path from the urlStr
		*/
		if (urlObj.origin === baseObj.origin) {
			return urlObj.pathname + urlObj.search + urlObj.hash;
		}
		return urlStr;
	} catch {
		return '';
	}
}

export function safeURIDecode(str: string): string {
	try {
		return decodeURIComponent(str);
	} catch {
		return str;
	}
}

/**
 * URLを表示用に分解する。ホスト名はPunycodeを、パス以降はパーセントエンコーディングをデコードする
 * @throws http(s) 以外のURLの場合
 */
export function parseUrlForDisplay(urlStr: string) {
	const url = new URL(urlStr);
	if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid url');

	return {
		schema: url.protocol,
		hostname: decodePunycode(url.hostname),
		port: url.port,
		pathname: safeURIDecode(url.pathname),
		query: safeURIDecode(url.search),
		hash: safeURIDecode(url.hash),
	};
}
