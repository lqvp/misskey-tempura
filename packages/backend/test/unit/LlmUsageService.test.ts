/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { describe, expect, test, vi } from 'vitest';
import { QueryFailedError } from 'typeorm';
import { LlmUsageService } from '@/core/LlmUsageService.js';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@/logger.js', () => ({ default: class { warn = warn; } }));

const input = { userId: 'deleted-user', purpose: 'other' as const, model: 'gemini-test', completedAt: new Date('2026-10-31T23:59:59Z'), success: true, usage: { input: 0, output: 12, thinking: null, cached: null, total: 15 } };

function setup() {
 const sql: { query: string; values?: unknown[] }[] = [];
 const runner = { releasePostgresConnection: vi.fn().mockResolvedValue(undefined), connect: vi.fn().mockResolvedValue(undefined), startTransaction: vi.fn().mockResolvedValue(undefined), commitTransaction: vi.fn().mockResolvedValue(undefined), rollbackTransaction: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined), query: vi.fn(async (query: string, values?: unknown[]) => { sql.push({ query, values }); return []; }) };
 const service = new LlmUsageService({ createQueryRunner: () => runner } as any);
 return { service, runner, sql };
}

describe('LLM usage write isolation', () => {
 for (const phase of ['startTransaction', 'query', 'commitTransaction', 'rollbackTransaction', 'release'] as const) test(`disposes a stalled ${phase} and returns within deadline`, async () => {
  vi.useFakeTimers();
  try {
   const { service, runner } = setup();
   const destroy = vi.fn(); const discard = vi.fn().mockResolvedValue(undefined);
   runner.connect.mockResolvedValue({ connection: { stream: { destroy } } } as any);
   (runner as any).releasePostgresConnection = discard;
   if (phase === 'rollbackTransaction') runner.query.mockRejectedValueOnce(new Error('fixture'));
   runner[phase].mockImplementation(() => new Promise(() => {}));
   let settled = false;
   const recording = service.record(input).then(() => { settled = true; });
   await vi.advanceTimersByTimeAsync(1600);
   expect(settled).toBe(true);
   await expect(recording).resolves.toBeUndefined();
   expect(destroy).toHaveBeenCalledOnce();
   expect(discard).toHaveBeenCalledWith(expect.any(Error));
   expect((service as any).unfinished).toBe(0);
  } finally { vi.useRealTimers(); }
 });

 test('query-runner construction failure is isolated from generation and releases capacity', async () => {
  const createQueryRunner = vi.fn(() => { throw new Error('fixture'); });
  const service = new LlmUsageService({ createQueryRunner } as any);
  for (let i = 0; i < 5; i++) await expect(service.record(input)).resolves.toBeUndefined();
  expect(createQueryRunner).toHaveBeenCalledTimes(5);
 });
 test('writes both aggregate tables in a transaction, totals first', async () => {
  const { service, runner, sql } = setup();
  await service.record(input);
  expect(sql.filter(x => x.query.startsWith('INSERT')).map(x => x.query.split(' ')[2])).toEqual(['"llm_usage_daily_total"', '"llm_usage_daily"']);
  expect(sql.at(-1)?.values).toContain('2026-10-31');
  expect(sql.at(-1)?.values).toContain('deleted-user');
  expect(runner.commitTransaction).toHaveBeenCalledOnce();
  expect(runner.release).toHaveBeenCalledOnce();
 });
 test('rolls back both on a write failure without leaking or throwing the error', async () => {
  const { service, runner } = setup();
  runner.query.mockRejectedValueOnce(new Error('private-api-key'));
  await expect(service.record(input)).resolves.toBeUndefined();
  expect(runner.rollbackTransaction).toHaveBeenCalledOnce();
  expect(runner.commitTransaction).not.toHaveBeenCalled();
  expect(runner.release).toHaveBeenCalledOnce();
 });
 test('admits at most four unfinished records and releases late connections without SQL', async () => {
  vi.useFakeTimers();
  try {
   const { service, runner } = setup();
   const connect: (() => void)[] = [];
   runner.connect.mockImplementation(() => new Promise<void>(resolve => { connect.push(resolve); }));
   const pending = Array.from({ length: 4 }, () => service.record(input));
   await expect(service.record(input)).resolves.toBeUndefined();
   expect(runner.connect).toHaveBeenCalledTimes(4);
   await vi.advanceTimersByTimeAsync(1001);
   await Promise.all(pending);
   await service.record(input);
   expect(runner.connect).toHaveBeenCalledTimes(4);
   for (const resolve of connect) resolve();
   await Promise.resolve();
   expect(runner.query).not.toHaveBeenCalled();
   expect(runner.releasePostgresConnection).toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
 });
});

for (const throwing of ['destroy', 'discard', 'both']) test(`synchronous ${throwing} disposal failure cannot escape deadline or skip other cleanup`, async () => {
 vi.useFakeTimers();
 try {
  const { service, runner } = setup();
  const destroy = vi.fn(() => { if (throwing !== 'discard') throw new Error('private destroy detail'); });
  const discard = vi.fn(() => { if (throwing !== 'destroy') throw new Error('private discard detail'); return Promise.resolve(); });
  runner.connect.mockResolvedValue({ connection: { stream: { destroy } } } as any);
  (runner as any).releasePostgresConnection = discard;
  runner.query.mockImplementation(() => new Promise(() => {}));
  const recording = service.record(input);
  await vi.advanceTimersByTimeAsync(1600);
  await expect(recording).resolves.toBeUndefined();
  expect(destroy).toHaveBeenCalledOnce(); expect(discard).toHaveBeenCalledOnce();
  expect((service as any).unfinished).toBe(0);
 } finally { vi.useRealTimers(); }
});

for (const [error, category] of [
 [new Error('LLM usage aggregate mismatch'), 'aggregate_mismatch'],
 [new QueryFailedError('private SQL', ['private key'], Object.assign(new Error('private detail'), { code: '57014' })), 'statement_timeout'],
 [new QueryFailedError('private SQL', ['private key'], Object.assign(new Error('private detail'), { code: '55P03' })), 'lock_timeout'],
 [new Error('private detail'), 'unknown'],
] as const) test(`cleanup logs only the fixed ${category} failure category`, async () => {
 const { service, runner } = setup();
 warn.mockClear();
 runner.query.mockRejectedValueOnce(error);
 try {
  await expect(service.cleanup(new Date('2026-10-28T00:00:00Z'))).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledWith(`LLM usage cleanup incomplete (${category}); will retry on the next cleanup`);
  expect(JSON.stringify(warn.mock.calls)).not.toContain('private');
  expect(runner.release).toHaveBeenCalledOnce();
 } finally { warn.mockClear(); }
});
