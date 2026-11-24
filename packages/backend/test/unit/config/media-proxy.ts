/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { classifyMediaProxyUrl, normalizeMediaProxyUrl, resolveMediaProxy } from '@/config.js';

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

	test('treats self proxy regardless of scheme as internal (no redirect loop)', () => {
		// TLS 終端構成で http を入力してもループしない
		expect(resolveMediaProxy(baseConfig, { mediaProxy: 'http://misskey.test/proxy' })).toEqual({
			mediaProxy: 'https://misskey.test/proxy',
			externalMediaProxyEnabled: false,
		});
		expect(resolveMediaProxy({ ...baseConfig, url: 'http://misskey.test' }, { mediaProxy: 'https://misskey.test/proxy' })).toEqual({
			mediaProxy: 'http://misskey.test/proxy',
			externalMediaProxyEnabled: false,
		});
	});

	test('falls back to config when meta.mediaProxy points at the self origin root', () => {
		expect(resolveMediaProxy(baseConfig, { mediaProxy: 'https://misskey.test' })).toEqual({
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

describe('classifyMediaProxyUrl', () => {
	const self = 'https://misskey.test';

	test('classifies self proxy / self root / external / invalid', () => {
		expect(classifyMediaProxyUrl('https://misskey.test/proxy', self)).toEqual({ kind: 'self-proxy', url: 'https://misskey.test/proxy' });
		expect(classifyMediaProxyUrl('http://misskey.test/proxy/', self)).toEqual({ kind: 'self-proxy', url: 'http://misskey.test/proxy' });
		expect(classifyMediaProxyUrl('https://misskey.test./proxy', self)).toEqual({ kind: 'self-proxy', url: 'https://misskey.test/proxy' });
		expect(classifyMediaProxyUrl('https://misskey.test', self)).toEqual({ kind: 'self-root', url: 'https://misskey.test' });
		expect(classifyMediaProxyUrl('https://proxy.example/proxy', self)).toEqual({ kind: 'external', url: 'https://proxy.example/proxy' });
		expect(classifyMediaProxyUrl('https://misskey.test/media-proxy', self)).toEqual({ kind: 'external', url: 'https://misskey.test/media-proxy' });
		expect(classifyMediaProxyUrl('javascript:alert(1)', self)).toEqual({ kind: 'invalid' });
		expect(classifyMediaProxyUrl(null, self)).toEqual({ kind: 'invalid' });
	});

	test('percent-encoded self proxy paths are still classified as self proxy', () => {
		expect(classifyMediaProxyUrl('https://misskey.test/%70roxy', self)).toEqual({ kind: 'self-proxy', url: 'https://misskey.test/%70roxy' });
		expect(classifyMediaProxyUrl('https://misskey.test/%50ROXY/', self)).toEqual({ kind: 'self-proxy', url: 'https://misskey.test/%50ROXY' });
		expect(classifyMediaProxyUrl('https://misskey.test/%E0%A4%A', self)).toEqual({ kind: 'invalid' });
	});
});
