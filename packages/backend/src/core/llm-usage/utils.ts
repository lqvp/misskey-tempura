/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { usageMetrics } from './types.js';
import type { Metric, UsageValues } from './types.js';

const fields: Record<Metric, string> = { input: 'promptTokenCount', output: 'candidatesTokenCount', thinking: 'thoughtsTokenCount', cached: 'cachedContentTokenCount', total: 'totalTokenCount' };

export function normalizeUsageMetadata(value: unknown): UsageValues {
 const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
 return Object.fromEntries(usageMetrics.map(metric => {
  const n = source[fields[metric]];
  return [metric, typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null];
 })) as UsageValues;
}

function firstDay(year: number, month: number): string {
 return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

export function monthRange(year: number, month: number): { start: string; end: string } {
 if (!Number.isInteger(year) || year < 1 || year > 9998 || !Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('Invalid UTC month');
 return { start: firstDay(year, month), end: firstDay(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1) };
}

export function retentionCutoff(now: Date, months: number): string | null {
 if (!Number.isInteger(months) || months < 0 || months > 2147483647 || !Number.isFinite(now.getTime())) throw new RangeError('Invalid retention');
 if (months === 0) return null;
 const index = now.getUTCFullYear() * 12 + now.getUTCMonth() - months + 1;
 if (index < 12) return '0001-01-01';
 return firstDay(Math.floor(index / 12), index % 12 + 1);
}
