/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import {
	validateAntennaRegexKeywords,
	testAntennaRegex,
	findAntennaRegexMatches,
	REGEX_GROUP_LIMIT,
	REGEX_KEYWORDS_PER_GROUP_LIMIT,
	REGEX_PATTERN_MAX_LENGTH,
} from '@/misc/antenna-regex.js';

describe('validateAntennaRegexKeywords', () => {
	it('accepts valid patterns', () => {
		expect(validateAntennaRegexKeywords([[['a+', 'b(c|d)']], [['x']]])).toBeNull();
	});

	it('rejects invalid patterns with detail', () => {
		const err = validateAntennaRegexKeywords([[['(unclosed']]]);
		expect(err?.reason).toBe('invalidPattern');
		expect(err?.pattern).toBe('(unclosed');
	});

	it('rejects lookaround (RE2 does not support it)', () => {
		expect(validateAntennaRegexKeywords([[['foo(?=bar)']]])?.reason).toBe('invalidPattern');
	});

	it('enforces group / keyword / length limits', () => {
		expect(validateAntennaRegexKeywords([Array(REGEX_GROUP_LIMIT + 1).fill(['a'])])?.reason).toBe('tooManyGroups');
		expect(validateAntennaRegexKeywords([[Array(REGEX_KEYWORDS_PER_GROUP_LIMIT + 1).fill('a')]])?.reason).toBe('tooManyKeywords');
		expect(validateAntennaRegexKeywords([[['a'.repeat(REGEX_PATTERN_MAX_LENGTH + 1)]]])?.reason).toBe('patternTooLong');
	});

	it('ignores empty items', () => {
		expect(validateAntennaRegexKeywords([[['']]])).toBeNull();
	});
});

describe('testAntennaRegex', () => {
	it('matches case-insensitively by default flag off', () => {
		expect(testAntennaRegex('Apple', 'xxapple', false)).toBe(true);
		expect(testAntennaRegex('Apple', 'xxapple', true)).toBe(false);
	});

	it('returns false for invalid patterns', () => {
		expect(testAntennaRegex('(bad', 'text', true)).toBe(false);
	});
});

describe('findAntennaRegexMatches', () => {
	it('collects positions for every match', () => {
		expect(findAntennaRegexMatches('a.', 'a1 a2', true)).toEqual([
			{ keyword: 'a.', start: 0, end: 2 },
			{ keyword: 'a.', start: 3, end: 5 },
		]);
	});

	it('handles zero-length matches without looping', () => {
		const matches = findAntennaRegexMatches('a*', 'b', true);
		expect(matches).toEqual([{ keyword: 'a*', start: 0, end: 0 }, { keyword: 'a*', start: 1, end: 1 }]);
	});
});
