/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { expect, test, vi } from 'vitest';
import { MetaService } from '@/core/MetaService.js';
import Overview, { meta } from '@/server/api/endpoints/admin/llm-usage/overview.js';
import Users from '@/server/api/endpoints/admin/llm-usage/users.js';

test('monthly endpoint validates dates and uses the dedicated admin scope', async () => {
 const service = { readMonth: async (year: number, month: number) => ({ year, month }) };
 const endpoint = new Overview(service as any);
 expect(await endpoint.exec({ year: 2026, month: 10 }, {} as any, null)).toEqual({ year: 2026, month: 10 });
 await expect(endpoint.exec({ year: 2026, month: 13 }, {} as any, null)).rejects.toBeDefined();
 expect(meta.requireAdmin).toBe(true); expect(meta.kind).toBe('read:admin:llm-usage');
});
test('user endpoint supplies bounded defaults and rejects excessive pagination', async () => {
 const endpoint = new Users({ readUsers: async (q: unknown) => q } as any);
 expect(await endpoint.exec({ year: 2026, month: 10 }, {} as any, null)).toEqual({ year: 2026, month: 10, sort: 'totalTokens', limit: 30, offset: 0 });
 await expect(endpoint.exec({ year: 2026, month: 10, limit: 101 }, {} as any, null)).rejects.toBeDefined();
 await expect(endpoint.exec({ year: 2026, month: 10, offset: 2147483648 }, {} as any, null)).rejects.toBeDefined();
});

for (const boundary of [undefined, '2026-05-01', '2026-06-01']) {
 test(`retention shortening checks server cutoff after acquiring its lock: ${boundary}`, async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T23:59:59Z'));
  const before = { id: 'x', llmUsageRetentionMonths: 12 };
  const update = vi.fn(); const publishInternalEvent = vi.fn();
  const builder = { orderBy() { return this; }, setLock() { return this; }, async getOne() { vi.setSystemTime(new Date('2026-11-01T00:00:01Z')); return before; } };
  const manager = { find: async () => [before], createQueryBuilder: () => builder, update };
  const service = new MetaService({ on() {}, off() {} } as any, { transaction: async (work: any) => work(manager) } as any, {} as any, { publishInternalEvent } as any);
  try {
   const result = (service.update as any)({ llmUsageRetentionMonths: 6, serverGeminiEnabled: false }, 12, boundary);
   if (boundary === '2026-06-01') { await result; expect(update).toHaveBeenCalledOnce(); expect(publishInternalEvent).toHaveBeenCalledOnce(); } else { await expect(result).rejects.toMatchObject({ constructor: expect.objectContaining({ name: 'RetentionBoundaryChangedError' }) }); expect(update).not.toHaveBeenCalled(); expect(publishInternalEvent).not.toHaveBeenCalled(); }
  } finally { service.dispose(); vi.useRealTimers(); }
 });
}

test('CAS failure takes precedence over cutoff failure', async () => {
 const before = { id: 'x', llmUsageRetentionMonths: 24 };
 const update = vi.fn(); const builder = { orderBy() { return this; }, setLock() { return this; }, getOne: async () => before };
 const service = new MetaService({ on() {}, off() {} } as any, { transaction: async (work: any) => work({ find: async () => [before], createQueryBuilder: () => builder, update }) } as any, {} as any, { publishInternalEvent: vi.fn() } as any);
 try { await expect(service.update({ llmUsageRetentionMonths: 6 }, 12)).rejects.toMatchObject({ constructor: expect.objectContaining({ name: 'RetainedSettingsChangedError' }) }); expect(update).not.toHaveBeenCalled(); } finally { service.dispose(); }
});

for (const [previous, next, boundary, allowed] of [[0, 6, undefined, false], [6, 12, undefined, true], [6, 0, undefined, true], [6, 6, undefined, true]] as const) {
 test(`retention ${previous} to ${next} requires cutoff only when shortened`, async () => {
  const before = { id: 'x', llmUsageRetentionMonths: previous }; const update = vi.fn();
  const builder = { orderBy() { return this; }, setLock() { return this; }, getOne: async () => before };
  const service = new MetaService({ on() {}, off() {} } as any, { transaction: async (work: any) => work({ find: async () => [before], createQueryBuilder: () => builder, update }) } as any, {} as any, { publishInternalEvent: vi.fn() } as any);
  try { const result = service.update({ llmUsageRetentionMonths: next }, previous, boundary); if (allowed) { await result; expect(update).toHaveBeenCalledOnce(); } else { await expect(result).rejects.toMatchObject({ constructor: expect.objectContaining({ name: 'RetentionBoundaryChangedError' }) }); expect(update).not.toHaveBeenCalled(); } } finally { service.dispose(); }
 });
}
