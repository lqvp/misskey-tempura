/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import {
	validateAntennaRegexKeywords,
	findAntennaKeywordLimitViolation,
	measureAntennaKeywordLimitExcess,
	isAntennaKeywordLimitExcessIncreased,
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

	it('reports which item was invalid so clients can point at it', () => {
		const err = validateAntennaRegexKeywords([
			[['ok']],
			[['fine', '(bad']],
		]);
		expect(err?.reason).toBe('invalidPattern');
		expect(err?.pattern).toBe('(bad');
		expect(err?.location).toEqual({ keywordType: 'excludeKeywords', groupIndex: 0, keywordIndex: 1 });
	});

	it('reports the location for limit violations', () => {
		expect(validateAntennaRegexKeywords([[], [], [['a'.repeat(REGEX_PATTERN_MAX_LENGTH + 1)]]])?.location)
			.toEqual({ keywordType: 'mustExcludeKeywords', groupIndex: 0, keywordIndex: 0 });
		expect(validateAntennaRegexKeywords([Array(REGEX_GROUP_LIMIT + 1).fill(['a'])])?.location)
			.toEqual({ keywordType: 'keywords', groupIndex: 0, keywordIndex: 0 });
	});
});

describe('findAntennaKeywordLimitViolation', () => {
	it('accepts keywords within the limits regardless of syntax', () => {
		// 構文が正規表現として不正でも、上限だけを見るので通る (literalモードの保存可否判定に使う)
		expect(findAntennaKeywordLimitViolation([[['(unclosed']]])).toBeNull();
	});

	it('reports the same limits as validateAntennaRegexKeywords', () => {
		expect(findAntennaKeywordLimitViolation([Array(REGEX_GROUP_LIMIT + 1).fill(['a'])])?.reason).toBe('tooManyGroups');
		expect(findAntennaKeywordLimitViolation([[Array(REGEX_KEYWORDS_PER_GROUP_LIMIT + 1).fill('a')]])?.reason).toBe('tooManyKeywords');
		expect(findAntennaKeywordLimitViolation([[['a'.repeat(REGEX_PATTERN_MAX_LENGTH + 1)]]])?.reason).toBe('patternTooLong');
	});

	it('accepts exactly at the limits', () => {
		expect(findAntennaKeywordLimitViolation([Array(REGEX_GROUP_LIMIT).fill(['a'])])).toBeNull();
		expect(findAntennaKeywordLimitViolation([[Array(REGEX_KEYWORDS_PER_GROUP_LIMIT).fill('a')]])).toBeNull();
		expect(findAntennaKeywordLimitViolation([[['a'.repeat(REGEX_PATTERN_MAX_LENGTH)]]])).toBeNull();
	});
});

describe('measureAntennaKeywordLimitExcess', () => {
	it('returns 0 for each keyword field within the limits', () => {
		expect(measureAntennaKeywordLimitExcess([[['a']], [['b']], []])).toEqual([0, 0, 0]);
	});

	it('counts how far each limit is exceeded', () => {
		expect(measureAntennaKeywordLimitExcess([Array(REGEX_GROUP_LIMIT + 2).fill(['a'])])).toEqual([2]);
		expect(measureAntennaKeywordLimitExcess([[Array(REGEX_KEYWORDS_PER_GROUP_LIMIT + 3).fill('a')]])).toEqual([3]);
		expect(measureAntennaKeywordLimitExcess([[['a'.repeat(REGEX_PATTERN_MAX_LENGTH + 5)]]])).toEqual([5]);
	});

	it('reports the excess per keyword field, not as a single total', () => {
		const overKeywords = Array.from({ length: 33 }, () => ['a']);
		expect(measureAntennaKeywordLimitExcess([overKeywords, [], []])).toEqual([1, 0, 0]);
		expect(measureAntennaKeywordLimitExcess([[], overKeywords, []])).toEqual([0, 1, 0]);
	});

	it('distinguishes a larger excess from the same excess', () => {
		const over33 = [[Array.from({ length: 33 }, () => 'a')]];
		const over40 = [[Array.from({ length: 40 }, () => 'a')]];
		expect(measureAntennaKeywordLimitExcess(over33)).toEqual([1]);
		expect(measureAntennaKeywordLimitExcess(over40)).toEqual([8]);
	});
});

describe('isAntennaKeywordLimitExcessIncreased', () => {
	it('is false when nothing is over the limit', () => {
		expect(isAntennaKeywordLimitExcessIncreased([[['a']], [['b']]], [[['a']], [['b']]])).toBe(false);
	});

	it('is false when the existing excess is kept as-is', () => {
		const over = [Array.from({ length: 33 }, () => 'a')];
		expect(isAntennaKeywordLimitExcessIncreased([over, []], [over, []])).toBe(false);
	});

	it('is false when the excess is reduced', () => {
		const over = [Array.from({ length: 40 }, () => 'a')];
		const less = [Array.from({ length: 33 }, () => 'a')];
		expect(isAntennaKeywordLimitExcessIncreased([less, []], [over, []])).toBe(false);
	});

	it('is true when the excess grows', () => {
		const over = [Array.from({ length: 33 }, () => 'a')];
		const more = [Array.from({ length: 40 }, () => 'a')];
		expect(isAntennaKeywordLimitExcessIncreased([more, []], [over, []])).toBe(true);
	});

	it('is true when excess is moved to another keyword field', () => {
		// keywords を減らして excludeKeywords を超過させる「付け替え」は許可しない
		const overKeywords = [Array.from({ length: 33 }, () => 'a')];
		const overExclude = [Array.from({ length: 33 }, () => 'a')];
		expect(isAntennaKeywordLimitExcessIncreased([[['a']], overExclude], [overKeywords, []])).toBe(true);
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

describe('whitespace preservation (regex mode)', () => {
	it('前後の空白を含む式をそのまま検証・評価する', () => {
		// 前後空白つきの式も構文検証を通る (trim しない)
		expect(validateAntennaRegexKeywords([[[' foo ', 'bar\t']]])).toBeNull();
		// 空白は式の一部として意味を持つ
		expect(testAntennaRegex(' foo', 'x foo y', true)).toBe(true);
		expect(testAntennaRegex(' foo', 'xfoo', true)).toBe(false);
		expect(testAntennaRegex('bar ', 'bar baz', true)).toBe(true);
		expect(testAntennaRegex('bar ', 'barbaz', true)).toBe(false);
	});

	it('改行を含む式をそのまま評価する', () => {
		expect(validateAntennaRegexKeywords([[['foo\nbar']]])).toBeNull();
		expect(testAntennaRegex('foo\nbar', 'see foo\nbar end', true)).toBe(true);
		expect(testAntennaRegex('foo\nbar', 'foo bar', true)).toBe(false);
	});
});

describe('shared cache isolation', () => {
	it('does not let test() disturb an in-progress exec() scan of the same pattern', () => {
		// キャッシュを共有していても、走査中の lastIndex が別呼び出しの test() に書き換えられないこと
		const text = 'xaxaxaxaxa';
		const first = findAntennaRegexMatches('a', text, true);
		expect(first.map(m => m.start)).toEqual([1, 3, 5, 7, 9]);

		// 同じ式で test() を挟んでも、続く走査結果は変わらない
		expect(testAntennaRegex('a', 'zzz', true)).toBe(false);
		const second = findAntennaRegexMatches('a', text, true);
		expect(second.map(m => m.start)).toEqual([1, 3, 5, 7, 9]);
	});

	it('keeps case-insensitivity after repeated cached calls', () => {
		for (let i = 0; i < 3; i++) {
			expect(testAntennaRegex('Apple', 'xxapple', false)).toBe(true);
			expect(testAntennaRegex('Apple', 'xxapple', true)).toBe(false);
			expect(findAntennaRegexMatches('apple', 'APPLE', false)).toHaveLength(1);
			expect(findAntennaRegexMatches('apple', 'APPLE', true)).toHaveLength(0);
		}
	});
});

describe('findAntennaRegexMatches limit', () => {
	it('limitを指定するとその件数で打ち切る', () => {
		expect(findAntennaRegexMatches('.', 'abc', true, 1)).toEqual([{ keyword: '.', start: 0, end: 1 }]);
		expect(findAntennaRegexMatches('.', 'abc', true, 2)).toHaveLength(2);
		expect(findAntennaRegexMatches('.', 'abc', true)).toHaveLength(3);
	});
});

describe('zero-length matches near surrogate pairs', () => {
	it('advances from the match start regardless of the exec implementation', () => {
		// 実装がゼロ幅マッチで lastIndex を自動前進させても、1文字飛ばさないこと
		const matches = findAntennaRegexMatches('a*', 'ab', true);
		expect(matches).toEqual([
			{ keyword: 'a*', start: 0, end: 1 },
			{ keyword: 'a*', start: 1, end: 1 },
			{ keyword: 'a*', start: 2, end: 2 },
		]);
	});

	it('ゼロ幅マッチの繰り上げがサロゲートペアを分割しない', () => {
		// '🍎b' はコードユニット [🍎(2), b(1)] = 長さ3。コードポイント境界は 0, 2, 3
		expect(findAntennaRegexMatches('a*', '🍎b', true)).toEqual([
			{ keyword: 'a*', start: 0, end: 0 },
			{ keyword: 'a*', start: 2, end: 2 },
			{ keyword: 'a*', start: 3, end: 3 },
		]);
	});
});
