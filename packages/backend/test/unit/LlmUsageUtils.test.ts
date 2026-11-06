/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { describe, expect, test } from 'vitest';
import { monthRange, normalizeUsageMetadata, retentionCutoff } from '@/core/llm-usage/utils.js';

describe('LLM usage numeric and UTC contracts', () => {
 test('missing is not zero and metrics are independent', () => {
  expect(normalizeUsageMetadata({ promptTokenCount: 0, candidatesTokenCount: 12, totalTokenCount: 20 })).toEqual({ input: 0, output: 12, thinking: null, cached: null, total: 20 });
  for (const value of [null, undefined, [], 12, 'x']) expect(normalizeUsageMetadata(value)).toEqual({ input: null, output: null, thinking: null, cached: null, total: null });
 });
 test('rejects unsafe and invalid measurements', () => {
  for (const value of [-1, 1.5, '12', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(normalizeUsageMetadata({ totalTokenCount: value }).total).toBeNull();
  expect(normalizeUsageMetadata({ totalTokenCount: Number.MAX_SAFE_INTEGER }).total).toBe(Number.MAX_SAFE_INTEGER);
  expect(normalizeUsageMetadata({ thoughtsTokenCount: 3, cachedContentTokenCount: 7 }).thinking).toBe(3);
  expect(normalizeUsageMetadata({ cachedContentTokenCount: 7 }).cached).toBe(7);
 });
 test.each([[2026, 10, '2026-10-01', '2026-11-01'], [2024, 2, '2024-02-01', '2024-03-01'], [2026, 12, '2026-12-01', '2027-01-01'], [1, 1, '0001-01-01', '0001-02-01'], [9998, 12, '9998-12-01', '9999-01-01']])('month %s/%s is half-open', (year, month, start, end) => {
  expect(monthRange(Number(year), Number(month))).toEqual({ start, end });
 });
 test('rejects invalid month ranges', () => {
  for (const [year, month] of [[0, 1], [9999, 1], [2026, 0], [2026, 13], [2026.5, 1], [2026, 1.5]]) expect(() => monthRange(year, month)).toThrow(RangeError);
 });
 test('retention counts current UTC month and clamps huge values', () => {
  const now = new Date('2026-10-31T23:59:59Z');
  expect(retentionCutoff(now, 12)).toBe('2025-11-01');
  expect(retentionCutoff(now, 6)).toBe('2026-05-01');
  expect(retentionCutoff(now, 1)).toBe('2026-10-01');
  expect(retentionCutoff(now, 0)).toBeNull();
  expect(retentionCutoff(now, 2147483647)).toBe('0001-01-01');
  expect(retentionCutoff(new Date('2026-11-01T00:00:00Z'), 12)).toBe('2025-12-01');
  for (const n of [-1, 1.5, NaN, Infinity, 2147483648]) expect(() => retentionCutoff(now, n)).toThrow(RangeError);
 });
});

test.each([
 ['2026-12-31T23:59:59Z', 1, '2026-12-01'],
 ['2027-01-01T00:00:00Z', 1, '2027-01-01'],
 ['2027-01-01T00:00:00Z', 6, '2026-08-01'],
 ['2026-11-01T00:00:00Z', 2147483647, '0001-01-01'],
])('server/client cutoff vector %s retention %s', (now, months, boundary) => {
 expect(retentionCutoff(new Date(now), Number(months))).toBe(boundary);
});
