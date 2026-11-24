/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { normalizeMediaProxyUrl, resolveMediaProxy } from '@/config.js';

describe('normalizeMediaProxyUrl', () => {
	test('normalizes valid http(s) URLs and strips trailing slashes', () => {
		expect(normalizeMediaProxyUrl('https://proxy.example/proxy/')).toBe('https://proxy.example/proxy');
		expect(normalizeMediaProxyUrl('  http://localhost:3002/proxy///  ')).toBe('http://localhost:3002/proxy');
		expect(normalizeMediaProxyUrl('https://proxy.example/')).toBe('https://proxy.example');
	});

	test('rejects empty, non-http(s), credentials, query, hash, CSS-breaking chars, and oversized URLs', () => {
		expect(normalizeMediaProxyUrl(null)).toBeNull();
		expect(normalizeMediaProxyUrl(undefined)).toBeNull();
		expect(normalizeMediaProxyUrl('')).toBeNull();
		expect(normalizeMediaProxyUrl('   ')).toBeNull();
		expect(normalizeMediaProxyUrl('javascript:alert(1)')).toBeNull();
		expect(normalizeMediaProxyUrl('data:text/html,hi')).toBeNull();
		expect(normalizeMediaProxyUrl('ftp://proxy.example/proxy')).toBeNull();
		expect(normalizeMediaProxyUrl('proxy.example/proxy')).toBeNull();
		expect(normalizeMediaProxyUrl('https://user:pass@proxy.example/proxy')).toBeNull();
		expect(normalizeMediaProxyUrl('https://proxy.example/proxy?x=1')).toBeNull();
		expect(normalizeMediaProxyUrl('https://proxy.example/proxy#frag')).toBeNull();
		expect(normalizeMediaProxyUrl('https://proxy.example/x),url(https://evil.example/y)')).toBeNull();
		expect(normalizeMediaProxyUrl("https://proxy.example/x'y")).toBeNull();
		expect(normalizeMediaProxyUrl('https://proxy.example/x"y')).toBeNull();
		expect(normalizeMediaProxyUrl('https://proxy.example/' + 'a'.repeat(250))).toBeNull();
		expect(normalizeMediaProxyUrl('https://proxy.example/' + 'あ'.repeat(30))).toBeNull();
	});

	test('strips trailing dots from hostname (FQDN notation)', () => {
		expect(normalizeMediaProxyUrl('https://proxy.example./proxy')).toBe('https://proxy.example/proxy');
		expect(normalizeMediaProxyUrl('https://proxy.example../proxy/')).toBe('https://proxy.example/proxy');
	});
});

describe('resolveMediaProxy', () => {
	const baseConfig = {
		url: 'https://misskey.test',
		mediaProxy: 'https://config-proxy.test/proxy',
		externalMediaProxyEnabled: true,
	};

	test('prefers meta.mediaProxy over config.mediaProxy', () => {
		expect(resolveMediaProxy(baseConfig, { mediaProxy: 'https://meta-proxy.test/proxy/' })).toEqual({
			mediaProxy: 'https://meta-proxy.test/proxy',
			externalMediaProxyEnabled: true,
		});
	});

	test('disables externalMediaProxyEnabled when meta.mediaProxy points to internal /proxy or subpath', () => {
		expect(resolveMediaProxy(baseConfig, { mediaProxy: 'https://misskey.test/proxy/' })).toEqual({
			mediaProxy: 'https://misskey.test/proxy',
			externalMediaProxyEnabled: false,
		});
		expect(resolveMediaProxy({ ...baseConfig, url: 'https://misskey.test/' }, { mediaProxy: 'https://misskey.test/proxy/nested' })).toEqual({
			mediaProxy: 'https://misskey.test/proxy',
			externalMediaProxyEnabled: false,
		});
	});

	test('falls back to config when meta.mediaProxy is null, empty, or invalid', () => {
		expect(resolveMediaProxy(baseConfig, { mediaProxy: null })).toEqual({
			mediaProxy: 'https://config-proxy.test/proxy',
			externalMediaProxyEnabled: true,
		});
		expect(resolveMediaProxy(baseConfig, { mediaProxy: '   ' })).toEqual({
			mediaProxy: 'https://config-proxy.test/proxy',
			externalMediaProxyEnabled: true,
		});
		expect(resolveMediaProxy(baseConfig, { mediaProxy: 'javascript:alert(1)' })).toEqual({
			mediaProxy: 'https://config-proxy.test/proxy',
			externalMediaProxyEnabled: true,
		});
		expect(resolveMediaProxy(baseConfig, null)).toEqual({
			mediaProxy: 'https://config-proxy.test/proxy',
			externalMediaProxyEnabled: true,
		});
	});

	test('treats trailing-dot self host as internal (no redirect loop)', () => {
		expect(resolveMediaProxy(baseConfig, { mediaProxy: 'https://misskey.test./proxy' })).toEqual({
			mediaProxy: 'https://misskey.test/proxy',
			externalMediaProxyEnabled: false,
		});
		expect(resolveMediaProxy({ ...baseConfig, url: 'https://misskey.test./' }, { mediaProxy: 'https://misskey.test/proxy' })).toEqual({
			mediaProxy: 'https://misskey.test/proxy',
			externalMediaProxyEnabled: false,
		});
	});
});
