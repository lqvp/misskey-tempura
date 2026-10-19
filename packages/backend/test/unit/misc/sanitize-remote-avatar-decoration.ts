/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { sanitizeRemoteAvatarDecoration } from '@/misc/sanitize-remote-avatar-decoration.js';

describe('sanitizeRemoteAvatarDecoration', () => {
	test('keeps only known fields with defaults', () => {
		expect(sanitizeRemoteAvatarDecoration({
			id: 'abc',
			url: 'https://example.com/a.png',
			evil: '<script>',
		})).toEqual({
			url: 'https://example.com/a.png',
			decoration: { id: 'abc', angle: 0, flipH: false, offsetX: 0, offsetY: 0, showBehind: false },
		});
	});

	test('clamps numbers to the i/update ranges', () => {
		const r = sanitizeRemoteAvatarDecoration({
			id: 'abc',
			url: 'https://example.com/a.png',
			angle: 100,
			offsetX: -9,
			offsetY: 0.1,
			flipH: true,
			showBehind: true,
		});
		expect(r?.decoration).toEqual({ id: 'abc', angle: 0.5, flipH: true, offsetX: -0.25, offsetY: 0.1, showBehind: true });
	});

	test('treats non-finite or non-number values as 0 and non-true booleans as false', () => {
		const r = sanitizeRemoteAvatarDecoration({
			id: 'abc',
			url: 'https://example.com/a.png',
			angle: Number.NaN,
			offsetX: '0.1',
			flipH: 'true',
			showBehind: 1,
		});
		expect(r?.decoration).toEqual({ id: 'abc', angle: 0, flipH: false, offsetX: 0, offsetY: 0, showBehind: false });
	});

	test('rejects invalid entries', () => {
		expect(sanitizeRemoteAvatarDecoration(null)).toBeNull();
		expect(sanitizeRemoteAvatarDecoration('x')).toBeNull();
		expect(sanitizeRemoteAvatarDecoration([])).toBeNull();
		expect(sanitizeRemoteAvatarDecoration({ id: '', url: 'https://example.com/a.png' })).toBeNull();
		expect(sanitizeRemoteAvatarDecoration({ id: 'a'.repeat(33), url: 'https://example.com/a.png' })).toBeNull();
		expect(sanitizeRemoteAvatarDecoration({ id: 'abc', url: 'http://example.com/a.png' })).toBeNull();
		expect(sanitizeRemoteAvatarDecoration({ id: 'abc' })).toBeNull();
	});
});
