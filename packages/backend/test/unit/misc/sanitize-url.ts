/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect } from '@jest/globals';
import { sanitizeUrls } from '@/misc/sanitize-url.js';

describe('sanitizeUrls', () => {
	test('removes YouTube tracking parameters', () => {
		const input = 'Check out this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abcd1234&feature=share';
		const expected = 'Check out this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
		expect(sanitizeUrls(input)).toBe(expected);
	});

	test('removes Twitter/X tracking parameters', () => {
		const input = 'https://twitter.com/user/status/123456789?s=20&t=abcdefg';
		const expected = 'https://twitter.com/user/status/123456789';
		expect(sanitizeUrls(input)).toBe(expected);
	});

	test('removes UTM parameters', () => {
		const input = 'Visit https://example.com/page?utm_source=twitter&utm_medium=social&utm_campaign=test&id=123';
		const expected = 'Visit https://example.com/page?id=123';
		expect(sanitizeUrls(input)).toBe(expected);
	});

	test('removes Amazon tracking parameters', () => {
		const input = 'Buy this: https://www.amazon.com/dp/B08N5WRWNW?tag=affiliate123&linkCode=ogi&th=1&psc=1&pf_rd_p=12345';
		const expected = 'Buy this: https://www.amazon.com/dp/B08N5WRWNW?th=1&psc=1';
		expect(sanitizeUrls(input)).toBe(expected);
	});

	test('handles multiple URLs in text', () => {
		const input = 'Link 1: https://youtube.com/watch?v=abc&si=123 and Link 2: https://example.com?utm_source=test';
		const expected = 'Link 1: https://youtube.com/watch?v=abc and Link 2: https://example.com/';
		expect(sanitizeUrls(input)).toBe(expected);
	});

	test('preserves non-tracking parameters', () => {
		const input = 'Search: https://www.google.com/search?q=misskey&hl=ja';
		const expected = 'Search: https://www.google.com/search?q=misskey&hl=ja';
		expect(sanitizeUrls(input)).toBe(expected);
	});

	test('handles URLs without parameters', () => {
		const input = 'Visit https://misskey.io/ for more info';
		const expected = 'Visit https://misskey.io/ for more info';
		expect(sanitizeUrls(input)).toBe(expected);
	});

	test('handles malformed URLs gracefully', () => {
		const input = 'This is not a URL: https://[invalid and https://valid.com?utm_source=test';
		const expected = 'This is not a URL: https://[invalid and https://valid.com/';
		expect(sanitizeUrls(input)).toBe(expected);
	});

	test('removes Instagram tracking parameters', () => {
		const input = 'https://www.instagram.com/p/ABC123/?igshid=xyz123';
		const expected = 'https://www.instagram.com/p/ABC123/';
		expect(sanitizeUrls(input)).toBe(expected);
	});

	test('removes TikTok tracking parameters', () => {
		const input = 'https://www.tiktok.com/@user/video/123456789?_t=8abc123&_r=1';
		const expected = 'https://www.tiktok.com/@user/video/123456789';
		expect(sanitizeUrls(input)).toBe(expected);
	});

	test('handles empty text', () => {
		expect(sanitizeUrls('')).toBe('');
	});

	test('handles text without URLs', () => {
		const input = 'This is just plain text without any URLs';
		expect(sanitizeUrls(input)).toBe(input);
	});
});