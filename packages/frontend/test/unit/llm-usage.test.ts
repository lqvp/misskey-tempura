/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { expect, test } from 'vitest';
import { formatUsageNumber, isRetentionShortening, retentionBoundary, chartTokenValue } from '@/utility/tempura-script/llm-usage.js';
test('retention warnings distinguish unlimited, extension and shortening', () => {
 expect(isRetentionShortening(12, 6)).toBe(true); expect(isRetentionShortening(0, 12)).toBe(true);
 for (const [a, b] of [[6, 12], [12, 0], [12, 12]]) expect(isRetentionShortening(a, b)).toBe(false);
 expect(retentionBoundary(new Date('2026-10-27Z'), 6)).toBe('2026-05-01');
});
test('keeps exact integer display and never joins unknown chart gaps', () => {
 expect(formatUsageNumber('18014398509481982')).toBe('18,014,398,509,481,982');
 expect(chartTokenValue(null)).toBeNull(); expect(chartTokenValue('0')).toBe(0);
 expect(chartTokenValue('18014398509481982')).toBeNull();
});

test.each([
 ['2026-12-31T23:59:59Z', 1, '2026-12-01'],
 ['2027-01-01T00:00:00Z', 1, '2027-01-01'],
 ['2027-01-01T00:00:00Z', 6, '2026-08-01'],
 ['2026-11-01T00:00:00Z', 2147483647, '0001-01-01'],
])('server/client cutoff vector %s retention %s', (now, months, boundary) => {
 expect(retentionBoundary(new Date(now), Number(months))).toBe(boundary);
});
