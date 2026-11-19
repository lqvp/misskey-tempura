/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { safeHttpUrl, tryParseUrl } from '@@/js/url.js';

describe('tryParseUrl', () => {
	test('parses an absolute URL', () => {
		expect(tryParseUrl('https://example.com/path')?.href).toBe('https://example.com/path');
	});

	test('parses a relative URL against a base URL', () => {
		expect(tryParseUrl('/path', 'https://example.com/base')?.href).toBe('https://example.com/path');
	});

	test('returns null for an invalid URL', () => {
		expect(tryParseUrl('https://[invalid')).toBeNull();
	});
});

describe('safeHttpUrl', () => {
	test('accepts http and https URLs', () => {
		expect(safeHttpUrl('https://example.com/path')).toBe('https://example.com/path');
		expect(safeHttpUrl('http://example.com/')).toBe('http://example.com/');
	});

	test('rejects javascript: and data: URLs', () => {
		expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
		expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
	});

	test('returns null for invalid, relative, or empty values', () => {
		expect(safeHttpUrl('not a url')).toBeNull();
		expect(safeHttpUrl('/relative/path')).toBeNull();
		expect(safeHttpUrl(null)).toBeNull();
		expect(safeHttpUrl(undefined)).toBeNull();
	});
});
