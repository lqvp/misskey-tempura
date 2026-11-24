/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import * as Misskey from 'misskey-js';
import { MediaProxy, normalizeMediaProxyUrl, validateMediaProxyUrl } from '@@/js/media-proxy.js';

function createMeta(mediaProxy = 'https://server.example/proxy'): Misskey.entities.MetaDetailed {
	return {
		mediaProxy,
	} as Misskey.entities.MetaDetailed;
}

describe('normalizeMediaProxyUrl', () => {
	test('normalizes valid http(s) media proxy URLs and strips trailing slashes', () => {
		expect(normalizeMediaProxyUrl('https://proxy.example/proxy/')).toBe('https://proxy.example/proxy');
		expect(normalizeMediaProxyUrl('  http://localhost:3002/proxy///  ')).toBe('http://localhost:3002/proxy');
		expect(normalizeMediaProxyUrl('https://proxy.example/')).toBe('https://proxy.example');
		// 連続スラッシュは別パス扱いで 404 になるため畳む
		expect(normalizeMediaProxyUrl('https://proxy.example//proxy//')).toBe('https://proxy.example/proxy');
	});

	test('returns null for empty, non-http(s), credentials, query/hash, CSS-breaking, or oversized URLs', () => {
		expect(normalizeMediaProxyUrl(null)).toBeNull();
		expect(normalizeMediaProxyUrl('')).toBeNull();
		expect(normalizeMediaProxyUrl('   ')).toBeNull();
		expect(normalizeMediaProxyUrl('javascript:alert(1)')).toBeNull();
		expect(normalizeMediaProxyUrl('data:text/html,hi')).toBeNull();
		expect(normalizeMediaProxyUrl('//proxy.example/proxy')).toBeNull();
		expect(normalizeMediaProxyUrl('https://user:pass@proxy.example/proxy')).toBeNull();
		expect(normalizeMediaProxyUrl('https://proxy.example/proxy?x=1')).toBeNull();
		expect(normalizeMediaProxyUrl('https://proxy.example/proxy#frag')).toBeNull();
		expect(normalizeMediaProxyUrl('https://proxy.example/x),url(https://evil.example/y)')).toBeNull();
		expect(normalizeMediaProxyUrl("https://proxy.example/x'y")).toBeNull();
	});
});

describe('MediaProxy', () => {
	const instanceUrl = 'https://server.example';

	test('falls back to localProxy when serverMetadata.mediaProxy is empty or invalid', () => {
		const proxy = new MediaProxy(createMeta(''), instanceUrl, () => null);
		expect(proxy.getProxiedImageUrl('https://remote.example/a.png', undefined, false, true))
			.toBe('https://server.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png');
	});

	test('uses serverMetadata.mediaProxy when custom proxy is not set', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => null);

		expect(proxy.getProxiedImageUrl('https://remote.example/a.png', 'emoji', false, true))
			.toBe('https://server-proxy.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&emoji=1');
		expect(proxy.getStaticImageUrl('https://remote.example/a.gif'))
			.toBe('https://server-proxy.example/proxy/static.webp?url=https%3A%2F%2Fremote.example%2Fa.gif&static=1');
	});

	test('avoids double-proxying when given already-proxied URLs', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => 'https://client-proxy.example/proxy');

		expect(proxy.getProxiedImageUrl('https://server-proxy.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png', 'preview', false, true))
			.toBe('https://client-proxy.example/proxy/preview.webp?url=https%3A%2F%2Fremote.example%2Fa.png&preview=1');
		expect(proxy.getProxiedImageUrl('/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fb.png', 'avatar', false, true))
			.toBe('https://client-proxy.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fb.png&avatar=1');
	});

	test('matches longest prefix first and does not misclassify non-proxy paths on root-origin proxies', () => {
		const proxy = new MediaProxy(createMeta('https://server.example'), instanceUrl, () => 'https://server.example');

		// Longest prefix (https://server.example/proxy) must match before root origin (https://server.example)
		expect(proxy.rewriteProxiedImageUrl('https://server.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&origin=1'))
			.toBe('https://server.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&origin=1');

		// Local drive URL on the same origin without ?url= must NOT be treated as already proxied
		expect(proxy.rewriteProxiedImageUrl('https://server.example/files/abc.gif'))
			.toBe('https://server.example/files/abc.gif');
		expect(proxy.getStaticImageUrl('https://server.example/files/abc.gif'))
			.toBe('https://server.example/static.webp?url=https%3A%2F%2Fserver.example%2Ffiles%2Fabc.gif&static=1');

		// Root-origin proxy URL with ?url= IS recognized and rewritten
		const switchedProxy = new MediaProxy(createMeta('https://cdn.example'), instanceUrl, () => 'https://client-proxy.example/proxy');
		expect(switchedProxy.rewriteProxiedImageUrl('https://cdn.example/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png'))
			.toBe('https://client-proxy.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png');
		expect(switchedProxy.rewriteProxiedImageUrl('https://cdn.example/files/abc.png'))
			.toBe('https://cdn.example/files/abc.png');
	});

	test('overrides with client custom media proxy for getProxiedImageUrl and getStaticImageUrl', () => {
		let clientProxy: string | null = 'https://client-proxy.example/proxy/';
		const proxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => clientProxy);

		expect(proxy.getProxiedImageUrl('https://remote.example/a.png', 'preview'))
			.toBe('https://client-proxy.example/proxy/preview.webp?url=https%3A%2F%2Fremote.example%2Fa.png&fallback=1&preview=1');
		expect(proxy.getStaticImageUrl('https://remote.example/a.gif'))
			.toBe('https://client-proxy.example/proxy/static.webp?url=https%3A%2F%2Fremote.example%2Fa.gif&static=1');

		// Already-proxied server URL passed to getStaticImageUrl is rewritten to client proxy
		expect(proxy.getStaticImageUrl('https://server-proxy.example/proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Ficon.gif&avatar=1'))
			.toBe('https://client-proxy.example/proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Ficon.gif&avatar=1&static=1');

		// Dynamic update when preference is cleared
		clientProxy = null;
		expect(proxy.getProxiedImageUrl('https://remote.example/a.png'))
			.toBe('https://server-proxy.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&fallback=1');
	});

	test('keeps localProxy when mustOrigin is true or input URL has origin=1 even if client custom proxy is set', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => 'https://client-proxy.example/proxy');

		expect(proxy.getProxiedImageUrl('https://remote.example/a.png', undefined, true))
			.toBe('https://server.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&fallback=1&origin=1');
		expect(proxy.getProxiedImageUrl('https://server.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&origin=1'))
			.toBe('https://server.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&fallback=1&origin=1');
	});

	test('rewrites backend-generated proxied URLs to the effective media proxy', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => 'https://client-proxy.example/proxy');

		// Server external proxy URL -> Client proxy URL
		expect(proxy.rewriteProxiedImageUrl('https://server-proxy.example/proxy/static.webp?url=https%3A%2F%2Fremote.example%2Fimg.png&static=1'))
			.toBe('https://client-proxy.example/proxy/static.webp?url=https%3A%2F%2Fremote.example%2Fimg.png&static=1');

		// Server internal /proxy URL (e.g. stored in user.avatarUrl) -> Client proxy URL
		expect(proxy.rewriteProxiedImageUrl('https://server.example/proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Favatar.png&avatar=1'))
			.toBe('https://client-proxy.example/proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Favatar.png&avatar=1');

		// Relative /proxy URL -> Client proxy URL
		expect(proxy.rewriteProxiedImageUrl('/proxy/preview.webp?url=https%3A%2F%2Fremote.example%2Fogp.png&preview=1'))
			.toBe('https://client-proxy.example/proxy/preview.webp?url=https%3A%2F%2Fremote.example%2Fogp.png&preview=1');

		// Non-proxied local drive URL -> untouched
		expect(proxy.rewriteProxiedImageUrl('https://server.example/files/abc-123'))
			.toBe('https://server.example/files/abc-123');

		// Origin-forced URL -> stays on localProxy
		expect(proxy.rewriteProxiedImageUrl('https://server.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&origin=1'))
			.toBe('https://server.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&origin=1');

		expect(proxy.rewriteProxiedImageUrlNullable(null)).toBeNull();
	});

	test('rewrite is idempotent for URLs already on the custom proxy', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => 'https://client-proxy.example/proxy');
		const once = proxy.rewriteProxiedImageUrl('https://server-proxy.example/proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Fa.png&avatar=1');
		expect(proxy.rewriteProxiedImageUrl(once)).toBe(once);
	});

	test('rewrites external proxy URL with origin=1 to the local proxy', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => 'https://client-proxy.example/proxy');
		expect(proxy.rewriteProxiedImageUrl('https://server-proxy.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&origin=1'))
			.toBe('https://server.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&origin=1');
	});

	test('normalizes uppercase scheme/host and trailing-dot host', () => {
		expect(normalizeMediaProxyUrl('HTTPS://PROXY.EXAMPLE/proxy/')).toBe('https://proxy.example/proxy');
		expect(normalizeMediaProxyUrl('https://proxy.example./proxy')).toBe('https://proxy.example/proxy');
	});

	test('getStaticImageUrl passes through invalid URLs', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => null);
		expect(proxy.getStaticImageUrl('http://')).toBe('http://');
	});

	test('getProxiedImageUrlNullable handles null and values', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => null);
		expect(proxy.getProxiedImageUrlNullable(null)).toBeNull();
		expect(proxy.getProxiedImageUrlNullable(undefined)).toBeNull();
		expect(proxy.getProxiedImageUrlNullable('https://remote.example/a.png', 'preview'))
			.toBe('https://server-proxy.example/proxy/preview.webp?url=https%3A%2F%2Fremote.example%2Fa.png&fallback=1&preview=1');
	});

	test('url extraction is independent of query parameter order', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => 'https://client-proxy.example/proxy');
		expect(proxy.getProxiedImageUrl('https://server-proxy.example/proxy/image.webp?static=1&url=https%3A%2F%2Fremote.example%2Fa.png&fallback=1', 'emoji', false, true))
			.toBe('https://client-proxy.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&emoji=1');
	});

	test('matches raw serverMetadata.mediaProxy with trailing-dot hostname when rewriting to client proxy', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example./proxy'), instanceUrl, () => 'https://client-proxy.example/proxy');
		expect(proxy.rewriteProxiedImageUrl('https://server-proxy.example./proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Favatar.png&avatar=1'))
			.toBe('https://client-proxy.example/proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Favatar.png&avatar=1');
	});

	test('absolutizes relative image URLs before proxying', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => null);
		expect(proxy.getProxiedImageUrl('/files/abc.png', undefined, false, true))
			.toBe('https://server-proxy.example/proxy/image.webp?url=https%3A%2F%2Fserver.example%2Ffiles%2Fabc.png');
	});

	test('treats normalized form of the server proxy as the same proxy', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example./proxy'), instanceUrl, () => null);
		// 正規化形 (ドット無し) で保存された URL でもオリジンを変えない
		expect(proxy.rewriteProxiedImageUrl('https://server-proxy.example/proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Fa.png&avatar=1'))
			.toBe('https://server-proxy.example/proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Fa.png&avatar=1');
	});

	test('keeps trailing-dot origin when no client proxy is configured', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example./proxy'), instanceUrl, () => null);

		// 既にサーバーのプロキシURLなら、オリジンを変えずそのまま返す
		expect(proxy.rewriteProxiedImageUrl('https://server-proxy.example./proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Favatar.png&avatar=1'))
			.toBe('https://server-proxy.example./proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Favatar.png&avatar=1');

		// 生成する URL もサーバーが実際に使っている表記を引き継ぐ
		expect(proxy.getStaticImageUrl('https://remote.example/a.gif'))
			.toBe('https://server-proxy.example./proxy/static.webp?url=https%3A%2F%2Fremote.example%2Fa.gif&static=1');
	});
});

describe('validateMediaProxyUrl', () => {
	const instanceUrl = 'https://misskey.test';

	test('returns normalized value for a valid external proxy and null for empty input', () => {
		expect(validateMediaProxyUrl('https://proxy.example/proxy/', instanceUrl)).toEqual({ ok: true, normalized: 'https://proxy.example/proxy' });
		expect(validateMediaProxyUrl('  ', instanceUrl)).toEqual({ ok: true, normalized: null });
	});

	test('rejects invalid URLs', () => {
		expect(validateMediaProxyUrl('javascript:alert(1)', instanceUrl)).toEqual({ ok: false, reason: 'invalid' });
		expect(validateMediaProxyUrl('https://proxy.example/proxy?x=1', instanceUrl)).toEqual({ ok: false, reason: 'invalid' });
	});

	test('rejects the instance own proxy and root origin (scheme-insensitive)', () => {
		expect(validateMediaProxyUrl('https://misskey.test/proxy', instanceUrl)).toEqual({ ok: false, reason: 'self' });
		expect(validateMediaProxyUrl('http://misskey.test/proxy/', instanceUrl)).toEqual({ ok: false, reason: 'self' });
		expect(validateMediaProxyUrl('https://misskey.test', instanceUrl)).toEqual({ ok: false, reason: 'self' });
	});

	test('rejects http proxy on an https instance (mixed content)', () => {
		expect(validateMediaProxyUrl('http://proxy.example.com/proxy', instanceUrl)).toEqual({ ok: false, reason: 'insecure' });
	});

	test('treats a non-string stored value as unset instead of throwing', () => {
		expect(validateMediaProxyUrl(true as unknown as string, instanceUrl)).toEqual({ ok: true, normalized: null });
		expect(validateMediaProxyUrl(123 as unknown as string, instanceUrl)).toEqual({ ok: true, normalized: null });
	});

	test('rejects client proxies longer than the input limit', () => {
		expect(validateMediaProxyUrl('https://proxy.example/' + 'a'.repeat(250), instanceUrl)).toEqual({ ok: false, reason: 'invalid' });
		expect(validateMediaProxyUrl('https://proxy.example/' + 'あ'.repeat(30), instanceUrl)).toEqual({ ok: false, reason: 'invalid' });
	});

	test('allows same-host proxy on a different path', () => {
		expect(validateMediaProxyUrl('https://misskey.test/media-proxy', instanceUrl)).toEqual({ ok: true, normalized: 'https://misskey.test/media-proxy' });
	});
});

describe('validateMediaProxyUrl edge cases', () => {
	const instanceUrl = 'https://misskey.test';

	test('rejects case/duplicate-slash variants of the self proxy path', () => {
		expect(validateMediaProxyUrl('HTTPS://MISSKEY.TEST/PROXY', instanceUrl)).toEqual({ ok: false, reason: 'self' });
		expect(validateMediaProxyUrl('https://misskey.test/Proxy/image.webp', instanceUrl)).toEqual({ ok: false, reason: 'self' });
		expect(validateMediaProxyUrl('https://misskey.test//proxy', instanceUrl)).toEqual({ ok: false, reason: 'self' });
	});

	test('rejects percent-encoded variants of the self proxy path', () => {
		expect(validateMediaProxyUrl('https://misskey.test/%70roxy', instanceUrl)).toEqual({ ok: false, reason: 'self' });
		expect(validateMediaProxyUrl('https://misskey.test/%50ROXY/image.webp', instanceUrl)).toEqual({ ok: false, reason: 'self' });
		expect(validateMediaProxyUrl('https://misskey.test/%E0%A4%A', instanceUrl)).toEqual({ ok: false, reason: 'invalid' });
	});

	test('handles ports, IPv6, and protocol-relative inputs', () => {
		expect(validateMediaProxyUrl('https://misskey.test:443/proxy', instanceUrl)).toEqual({ ok: false, reason: 'self' });
		expect(validateMediaProxyUrl('https://misskey.test:8443/proxy', instanceUrl)).toEqual({ ok: true, normalized: 'https://misskey.test:8443/proxy' });
		expect(validateMediaProxyUrl('https://[::1]:3000/proxy', 'https://[::1]:3000')).toEqual({ ok: false, reason: 'self' });
		expect(validateMediaProxyUrl('//proxy.example/proxy', instanceUrl)).toEqual({ ok: false, reason: 'invalid' });
	});
});

describe('MediaProxy additional paths', () => {
	const instanceUrl = 'https://server.example';

	test('converts internal /proxy to the external server proxy when no client proxy is set', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => null);
		expect(proxy.rewriteProxiedImageUrl('/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&avatar=1'))
			.toBe('https://server-proxy.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&avatar=1');
	});

	test('passes /emoji/ paths through in getStaticImageUrl', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => null);
		expect(proxy.getStaticImageUrl('/emoji/foo.webp')).toBe('https://server.example/emoji/foo.webp?static=1');
	});

	test('treats only origin=1 as origin-forced', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => 'https://client-proxy.example/proxy');
		expect(proxy.rewriteProxiedImageUrl('https://server-proxy.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&origin=1'))
			.toBe('https://server.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&origin=1');
		// origin=0 はオリジン強制ではないので client proxy へ寄せる
		expect(proxy.rewriteProxiedImageUrl('https://server-proxy.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&origin=0'))
			.toBe('https://client-proxy.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&origin=0');
	});

	test('returns empty string for empty image URLs', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => null);
		expect(proxy.getProxiedImageUrl('')).toBe('');
	});

	test('keeps a server media proxy that exceeds the client input limit', () => {
		const longProxy = `https://server-proxy.example/${'a'.repeat(300)}`;
		const proxy = new MediaProxy(createMeta(longProxy), instanceUrl, () => null);
		expect(proxy.getProxiedImageUrl('https://remote.example/a.png', undefined, false, true))
			.toBe(`${longProxy}/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png`);
	});

	test('picks up the server media proxy once instance metadata is loaded', () => {
		const meta = {} as Misskey.entities.MetaDetailed;
		const proxy = new MediaProxy(meta, instanceUrl, () => null);

		// メタデータ取得前は内蔵プロキシへフォールバックする
		expect(proxy.getProxiedImageUrl('https://remote.example/a.png', undefined, false, true))
			.toBe('https://server.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png');

		// 取得後の値はキャッシュされた古い値ではなく新しい値を使う
		(meta as { mediaProxy?: string }).mediaProxy = 'https://server-proxy.example/proxy';
		expect(proxy.getProxiedImageUrl('https://remote.example/a.png', undefined, false, true))
			.toBe('https://server-proxy.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png');
	});

	test('follows preference changes back and forth without keeping a stale cache', () => {
		let current: string | null = 'https://client-a.example/proxy';
		const proxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => current);

		expect(proxy.getProxiedImageUrl('https://remote.example/a.png')).toContain('https://client-a.example/proxy/');
		current = 'https://client-b.example/proxy';
		expect(proxy.getProxiedImageUrl('https://remote.example/a.png')).toContain('https://client-b.example/proxy/');
		current = 'https://client-a.example/proxy';
		expect(proxy.getProxiedImageUrl('https://remote.example/a.png')).toContain('https://client-a.example/proxy/');
	});

	test('ignores a stored client proxy that points at the instance proxy or downgrades to http', () => {
		const expected = 'https://server-proxy.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&fallback=1';

		// 保存値は入力時検証を通っていないことがある (クラウドバックアップや手編集)
		const selfProxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => 'https://server.example/proxy');
		expect(selfProxy.getProxiedImageUrl('https://remote.example/a.png')).toBe(expected);

		const insecure = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => 'http://client-proxy.example/proxy');
		expect(insecure.getProxiedImageUrl('https://remote.example/a.png')).toBe(expected);
	});

	test('does not throw for null image URLs', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => 'https://client-proxy.example/proxy');
		expect(proxy.getProxiedImageUrl(null as unknown as string)).toBe('');
		expect(proxy.rewriteProxiedImageUrl(null as unknown as string)).toBe('');
	});

	test('ignores a stored preference that is not a string', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => true as unknown as string);
		expect(proxy.getProxiedImageUrl('https://remote.example/a.png'))
			.toBe('https://server-proxy.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&fallback=1');
	});

	test('treats a custom root-origin proxy as proxied only when the URL carries url=', () => {
		const proxy = new MediaProxy(createMeta('https://server-proxy.example/proxy'), instanceUrl, () => 'https://cdn.example');

		// ルートオリジン直下の /files/ はプロキシ済み URL ではない
		expect(proxy.getProxiedImageUrl('https://cdn.example/files/abc.png'))
			.toBe('https://cdn.example/image.webp?url=https%3A%2F%2Fcdn.example%2Ffiles%2Fabc.png&fallback=1');
		// ?url= を持つ URL はプロキシ済みとして扱い、二重プロキシしない
		expect(proxy.rewriteProxiedImageUrl('https://cdn.example/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png'))
			.toBe('https://cdn.example/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png');
	});
});
