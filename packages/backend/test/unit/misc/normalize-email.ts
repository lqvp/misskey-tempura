/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { normalizeEmailForComparison } from '@/misc/normalize-email.js';

describe('normalizeEmailForComparison', () => {
	test('大文字小文字を無視する', () => {
		expect(normalizeEmailForComparison('User@Example.COM')).toBe('user@example.com');
	});

	test('+ 以降の別名を落とす', () => {
		expect(normalizeEmailForComparison('user+spam@example.com')).toBe('user@example.com');
		expect(normalizeEmailForComparison('user+a+b@example.com')).toBe('user@example.com');
	});

	test('+ で始まるローカル部はそのまま残す', () => {
		expect(normalizeEmailForComparison('+tag@example.com')).toBe('+tag@example.com');
	});

	test('Gmail ではドットを落とし googlemail も同一視する', () => {
		expect(normalizeEmailForComparison('U.Ser+1@googlemail.com')).toBe('user@gmail.com');
		expect(normalizeEmailForComparison('u.ser@gmail.com')).toBe('user@gmail.com');
	});

	test('Gmail 以外のドットは残す', () => {
		expect(normalizeEmailForComparison('u.ser@example.com')).toBe('u.ser@example.com');
	});
});
