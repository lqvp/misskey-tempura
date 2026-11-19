/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { normalizeSignupPassphrase, isSignupPassphraseMatch } from '@/misc/normalize-signup-passphrase.js';

describe('normalizeSignupPassphrase', () => {
	test('collapses whitespace and trims', () => {
		expect(normalizeSignupPassphrase('  hello   world  ')).toBe('hello world');
	});

	test('is case-insensitive', () => {
		expect(normalizeSignupPassphrase('HeLLo')).toBe('hello');
	});

	test('normalizes full-width characters via NFKC', () => {
		expect(normalizeSignupPassphrase('Ｔｅｓｔ　Ｐｈｒａｓｅ')).toBe('test phrase');
	});

	test('normalizes full-width alphanumerics mixed with half-width', () => {
		expect(normalizeSignupPassphrase('ｍｉｓｓｋｅｙ １２３')).toBe('misskey 123');
	});
});

describe('isSignupPassphraseMatch', () => {
	test('matches with formatting differences', () => {
		expect(isSignupPassphraseMatch('  規約を よんだ  ', '規約を　よんだ')).toBe(true);
	});

	test('rejects different passphrases', () => {
		expect(isSignupPassphraseMatch('wrong', 'correct')).toBe(false);
	});

	test('rejects empty input', () => {
		expect(isSignupPassphraseMatch('', 'correct')).toBe(false);
		expect(isSignupPassphraseMatch('   ', 'correct')).toBe(false);
	});

	test('rejects when expected is null or empty', () => {
		expect(isSignupPassphraseMatch('correct', null)).toBe(false);
		expect(isSignupPassphraseMatch('correct', undefined)).toBe(false);
		expect(isSignupPassphraseMatch('correct', '')).toBe(false);
	});

	test('rejects when input is null or undefined', () => {
		expect(isSignupPassphraseMatch(null, 'correct')).toBe(false);
		expect(isSignupPassphraseMatch(undefined, 'correct')).toBe(false);
	});

	test('rejects non-string runtime values', () => {
		// /signup は生ルートのため文字列以外が渡ってくる可能性がある
		expect(isSignupPassphraseMatch({} as unknown as string, 'correct')).toBe(false);
		expect(isSignupPassphraseMatch('correct', [] as unknown as string)).toBe(false);
	});
});
