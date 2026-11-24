/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { query, tryParseUrl } from './url.js';

export const MEDIA_PROXY_URL_MAX_LENGTH = 256;

export function normalizeMediaProxyUrl(url: string | null | undefined): string | null {
	if (url == null) return null;
	const trimmed = url.trim();
	if (trimmed === '') return null;
	// CSS url(...) インジェクションや制御文字混入を防ぐ
	if (/[\s'"()\\\x00-\x1f\x7f]/.test(trimmed)) return null;
	const parsed = tryParseUrl(trimmed);
	if (parsed == null) return null;
	if (!['http:', 'https:'].includes(parsed.protocol)) return null;
	if (parsed.username !== '' || parsed.password !== '') return null;
	if (parsed.search !== '' || parsed.hash !== '') return null;
	// 末尾ドット付きホスト (FQDN 表記) は自サーバー判定をすり抜けるため除去する
	parsed.hostname = parsed.hostname.replace(/\.+$/, '');
	const normalized = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
	if (normalized.length > MEDIA_PROXY_URL_MAX_LENGTH) return null;
	return normalized;
}

export class MediaProxy {
	private serverMetadata: Misskey.entities.MetaDetailed;
	private url: string;
	private customMediaProxyGetter?: () => string | null | undefined;

	constructor(
		serverMetadata: Misskey.entities.MetaDetailed,
		url: string,
		customMediaProxyGetter?: () => string | null | undefined,
	) {
		this.serverMetadata = serverMetadata;
		this.url = url;
		this.customMediaProxyGetter = customMediaProxyGetter;
	}

	private get customMediaProxy(): string | null {
		return normalizeMediaProxyUrl(this.customMediaProxyGetter?.());
	}

	/** サーバーが実際に使っている表記 (検証済み)。末尾ドット付きホスト等もそのまま保持する */
	private get serverMediaProxy(): string | null {
		const raw = typeof this.serverMetadata.mediaProxy === 'string' ? this.serverMetadata.mediaProxy.trim() : '';
		if (raw === '') return null;
		if (normalizeMediaProxyUrl(raw) == null) return null;
		return raw.replace(/\/+$/, '');
	}

	private get effectiveMediaProxy(): string {
		return this.customMediaProxy
			?? this.serverMediaProxy
			?? `${this.url}/proxy`;
	}

	private matchProxyPrefix(imageUrl: string): string | null {
		const localProxy = `${this.url}/proxy`;
		const serverProxy = normalizeMediaProxyUrl(this.serverMetadata.mediaProxy);
		// default.yml 由来の末尾ドット付きホスト等で保存済みURLがそのまま残る場合も照合できるよう、元表記も候補に含める
		const rawServerProxy = this.serverMediaProxy;
		const customProxy = this.customMediaProxy;

		const prefixes = Array.from(new Set([
			...(customProxy != null ? [customProxy] : []),
			...(serverProxy != null ? [serverProxy] : []),
			...(rawServerProxy != null ? [rawServerProxy] : []),
			localProxy,
			'/proxy',
		])).sort((a, b) => b.length - a.length);

		for (const prefix of prefixes) {
			if (imageUrl.startsWith(prefix + '/')) {
				// ルートオリジン直下をプロキシURLにしている場合、/files/... 等の非プロキシURLを誤爆しないよう ?url= を要求する
				if (prefix !== '/proxy' && tryParseUrl(prefix)?.pathname === '/') {
					const parsed = tryParseUrl(imageUrl, this.url);
					if (!parsed?.searchParams.has('url')) continue;
				}
				return prefix;
			}
		}

		return null;
	}

	public getProxiedImageUrl(imageUrl: string, type?: 'preview' | 'emoji' | 'avatar', mustOrigin = false, noFallback = false): string {
		const localProxy = `${this.url}/proxy`;
		let _imageUrl = imageUrl;
		let _mustOrigin = mustOrigin;
		const matchedPrefix = this.matchProxyPrefix(imageUrl);

		if (matchedPrefix != null) {
			// もう既にproxyっぽそうだったらurlを取り出す（origin=1 は維持する）
			const parsed = tryParseUrl(imageUrl, this.url);
			_imageUrl = parsed?.searchParams.get('url') ?? imageUrl;
			if (parsed?.searchParams.has('origin')) {
				_mustOrigin = true;
			}
		}

		// 個別設定が無く、元の接続先が実際に使われているプロキシと同一なら、そのオリジンを維持する
		const base = _mustOrigin
			? localProxy
			: matchedPrefix != null && this.customMediaProxy == null && matchedPrefix === this.serverMediaProxy
				? matchedPrefix
				: this.effectiveMediaProxy;

		return `${base}/${
			type === 'preview' ? 'preview.webp'
			: 'image.webp'
		}?${query({
			url: _imageUrl,
			...(!noFallback ? { 'fallback': '1' } : {}),
			...(type ? { [type]: '1' } : {}),
			...(_mustOrigin ? { origin: '1' } : {}),
		})}`;
	}

	public getProxiedImageUrlNullable(imageUrl: string | null | undefined, type?: 'preview'): string | null {
		if (imageUrl == null) return null;
		return this.getProxiedImageUrl(imageUrl, type);
	}

	public getStaticImageUrl(baseUrl: string): string {
		const u = tryParseUrl(baseUrl, this.url);
		if (u == null) return baseUrl;

		if (u.href.startsWith(`${this.url}/emoji/`)) {
			// もう既にemojiっぽそうだったらsearchParams付けるだけ
			u.searchParams.set('static', '1');
			return u.href;
		}

		if (this.matchProxyPrefix(u.href) != null) {
			// もう既にproxyっぽそうだったらsearchParams付けた上で向き先を揃える
			u.searchParams.set('static', '1');
			return this.rewriteProxiedImageUrl(u.href);
		}

		return `${this.effectiveMediaProxy}/static.webp?${query({
			url: u.href,
			static: '1',
		})}`;
	}

	public rewriteProxiedImageUrl(imageUrl: string): string {
		const prefix = this.matchProxyPrefix(imageUrl);
		if (prefix == null) return imageUrl;

		const parsed = tryParseUrl(imageUrl, this.url);
		if (parsed?.searchParams.has('origin')) {
			return `${this.url}/proxy${imageUrl.slice(prefix.length)}`;
		}

		// 個別設定が無く、元の接続先が実際に使われているプロキシと同一なら、オリジンを変えずにそのまま返す
		if (this.customMediaProxy == null && prefix === this.serverMediaProxy) return imageUrl;

		return `${this.effectiveMediaProxy}${imageUrl.slice(prefix.length)}`;
	}

	public rewriteProxiedImageUrlNullable(imageUrl: string | null | undefined): string | null {
		if (imageUrl == null) return null;
		return this.rewriteProxiedImageUrl(imageUrl);
	}
}
