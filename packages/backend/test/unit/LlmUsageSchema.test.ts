/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { describe, expect, test } from 'vitest';
import { getMetadataArgsStorage } from 'typeorm';
import { MiLlmUsageDaily } from '@/models/LlmUsageDaily.js';
import { MiLlmUsageDailyTotal } from '@/models/LlmUsageDailyTotal.js';
import { MiMeta } from '@/models/Meta.js';

describe('LLM usage persistence schema', () => {
 test('stores aggregate counters only, without user relation or execution timestamp', () => {
  const metadata = getMetadataArgsStorage();
  for (const entity of [MiLlmUsageDaily, MiLlmUsageDailyTotal]) {
   const columns = metadata.columns.filter(c => c.target === entity);
   expect(columns.map(c => c.propertyName).sort()).toEqual(['date', ...(entity === MiLlmUsageDaily ? ['userId'] : []), 'purpose', 'model', 'requests', 'successes', 'failures', ...['input', 'output', 'thinking', 'cached', 'total'].flatMap(m => [`${m}Tokens`, `${m}Samples`])].sort());
   expect(metadata.relations.filter(r => r.target === entity)).toHaveLength(0);
   expect(columns.find(c => c.propertyName === 'requests')?.options.type).toBe('bigint');
  }
  expect(metadata.columns.find(c => c.target === MiMeta && c.propertyName === 'llmUsageRetentionMonths')?.options.default).toBe(12);
 });
});
