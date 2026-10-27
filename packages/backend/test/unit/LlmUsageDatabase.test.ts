/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { DataSource } from 'typeorm';
import pg from 'pg';
import { loadConfig } from '@/config.js';
import { MiLlmUsageDaily } from '@/models/LlmUsageDaily.js';
import { MiLlmUsageDailyTotal } from '@/models/LlmUsageDailyTotal.js';
import { LlmUsageService } from '@/core/LlmUsageService.js';
import GenerationEndpoint from '@/server/api/endpoints/notes/llm-gen.js';

const config = loadConfig();
const db = new DataSource({ type: 'postgres', host: config.db.host, port: config.db.port, username: config.db.user, password: config.db.pass, database: config.db.db, schema: 'llm_usage_unit', entities: [MiLlmUsageDaily, MiLlmUsageDailyTotal], extra: { options: '-c search_path=llm_usage_unit' } });
const input = { userId: 'missing-user', purpose: 'other' as const, model: 'gemini-test', completedAt: new Date('2026-10-31T23:59:59Z'), success: true, usage: { input: 0, output: 12, thinking: null, cached: null, total: 15 } };
let service: LlmUsageService;
beforeAll(async () => { await db.initialize(); await db.query('CREATE SCHEMA IF NOT EXISTS llm_usage_unit'); await db.synchronize(); await db.query('CREATE TABLE llm_usage_unit.meta (id varchar PRIMARY KEY, "llmUsageRetentionMonths" integer NOT NULL, "llmUsageStartedAt" timestamptz NOT NULL)'); await db.query("INSERT INTO llm_usage_unit.meta VALUES ('x', 12, '2026-01-01Z')"); await db.query('CREATE TABLE llm_usage_unit."user" (id varchar PRIMARY KEY, username varchar, host varchar, name varchar, "avatarId" varchar, "avatarUrl" varchar, "isDeleted" boolean NOT NULL DEFAULT false)'); service = new LlmUsageService(db); });
beforeEach(async () => { await db.query('TRUNCATE llm_usage_daily, llm_usage_daily_total'); });
afterAll(async () => { if (db.isInitialized) { await db.query('DROP SCHEMA llm_usage_unit CASCADE'); await db.destroy(); } });
describe('LLM usage real PostgreSQL writes', () => {
 test('four concurrent records per batch, awaited across 25 batches, lose no updates', async () => {
  for (let batch = 0; batch < 25; batch++) await Promise.all(Array.from({ length: 4 }, (_, i) => service.record({ ...input, success: batch !== 24, userId: `deleted-${i}` })));
  const [total] = await db.query('SELECT * FROM llm_usage_daily_total');
  const [daily] = await db.query('SELECT SUM(requests)::text AS requests, SUM("totalTokens")::text AS tokens FROM llm_usage_daily');
  expect(total.requests).toBe('100'); expect(total.successes).toBe('96'); expect(total.failures).toBe('4'); expect(total.totalTokens).toBe('1440'); expect(total.totalSamples).toBe('96'); expect(total.inputTokens).toBe('0'); expect(total.inputSamples).toBe('96'); expect(total.thinkingSamples).toBe('0');
  expect(daily).toEqual({ requests: '100', tokens: '1440' });
 });
 test('monthly overview groups consistently and counts distinct missing users', async () => {
  await service.record(input); await service.record({ ...input, purpose: 'note-summary', model: 'other-model' });
  await service.record({ ...input, userId: 'second-missing', completedAt: new Date('2026-10-01Z') });
  await service.record({ ...input, completedAt: new Date('2026-11-01Z') });
  const overview = await service.readMonth(2026, 10);
  expect(overview.summary.requests).toBe('3'); expect(overview.uniqueUsers).toBe('2');
  expect(overview.summary.tokens.total.value).toBe('45'); expect(overview.summary.tokens.thinking.value).toBeNull();
  expect(overview.daily.map((x: { date: string }) => x.date)).toEqual(['2026-10-01', '2026-10-31']); expect(overview.daily).toHaveLength(2); expect(overview.byPurpose).toHaveLength(2); expect(overview.byModel).toHaveLength(2);
 });
 test('users sorts missing after measured zero and paginates with hasMore', async () => {
  await service.record({ ...input, userId: 'unknown', usage: { ...input.usage, total: null } });
  await service.record({ ...input, userId: 'zero', usage: { ...input.usage, total: 0 } });
  const page = await service.readUsers({ year: 2026, month: 10, sort: 'totalTokens', offset: 0, limit: 1 });
  expect(page.hasMore).toBe(true); expect(page.items[0].userId).toBe('zero'); expect(page.items[0].user).toBeNull();
 });
 test('cleanup deletes expired data in bounded chunks and keeps cutoff day', async () => {
  await db.query('UPDATE meta SET "llmUsageRetentionMonths" = 6');
  for (let i = 0; i < 3; i++) await service.record({ ...input, userId: `expired-${i}`, completedAt: new Date('2026-04-30Z') });
  await service.record({ ...input, completedAt: new Date('2026-05-01Z') });
  await service.cleanup(new Date('2026-10-27Z'));
  expect((await db.query('SELECT SUM(requests)::text AS n FROM llm_usage_daily'))[0].n).toBe('1');
  expect((await db.query('SELECT SUM(requests)::text AS n FROM llm_usage_daily_total'))[0].n).toBe('1');
 });
 test('unlimited retention does not delete old data', async () => {
  await db.query('UPDATE meta SET "llmUsageRetentionMonths" = 0');
  await service.record({ ...input, completedAt: new Date('2020-01-01Z') });
  await service.cleanup(new Date('2026-10-27Z'));
  expect((await db.query('SELECT requests FROM llm_usage_daily_total'))[0].requests).toBe('1');
 });
 test('cleans a large day across 500-row chunks without aggregate drift', async () => {
  await db.query('UPDATE meta SET "llmUsageRetentionMonths" = 6');
  for (let batch = 0; batch < 300; batch++) await Promise.all(Array.from({ length: 4 }, (_, i) => service.record({ ...input, userId: `large-${batch * 4 + i}`, completedAt: new Date('2026-04-30Z') })));
  await service.cleanup(new Date('2026-10-27Z'));
  expect(await db.query('SELECT * FROM llm_usage_daily')).toHaveLength(0);
  expect(await db.query('SELECT * FROM llm_usage_daily_total')).toHaveLength(0);
 });
 for (const phase of ['candidate', 'locked'] as const) test(`concurrent record after ${phase} retains total/daily equality`, async () => {
  await db.query('UPDATE meta SET "llmUsageRetentionMonths" = 6');
  const expired = { ...input, completedAt: new Date('2026-04-30Z') };
  await service.record(expired);
  const original = db.createQueryRunner.bind(db); let injected = false;
  const wrapped = { createQueryRunner() {
   const runner = original(); const query = runner.query.bind(runner);
   runner.query = (async (sql: string, ...args: any[]) => {
    const result = await (query as any)(sql, ...args);
    if (!injected && ((phase === 'candidate' && sql.startsWith('SELECT date::text')) || (phase === 'locked' && sql.startsWith('SELECT * FROM llm_usage_daily_total')))) {
     injected = true; await service.record(expired);
    }
    return result;
   }) as typeof runner.query;
   return runner;
  } };
  await new LlmUsageService(wrapped as any).cleanup(new Date('2026-10-27Z'));
  expect(injected).toBe(true);
  expect(await db.query('SELECT * FROM llm_usage_daily')).toHaveLength(0);
  expect(await db.query('SELECT * FROM llm_usage_daily_total')).toHaveLength(0);
 });
 test('retention extension waits for batch lock then next chunk reads new cutoff', async () => {
  await db.query('UPDATE meta SET "llmUsageRetentionMonths" = 6');
  for (let batch = 0; batch < 126; batch++) await Promise.all(Array.from({ length: 4 }, (_, i) => service.record({ ...input, userId: `extension-${batch * 4 + i}`, completedAt: new Date('2026-04-30Z') })));
  const original = db.createQueryRunner.bind(db); let extension: Promise<unknown> | undefined; let settled = false; let injected = false;
  const wrapped = { createQueryRunner() {
   const runner = original(); const query = runner.query.bind(runner);
   runner.query = (async (sql: string, ...args: any[]) => {
    const result = await (query as any)(sql, ...args);
    if (!injected && sql.startsWith('SELECT date::text')) {
     injected = true;
     extension = db.query('UPDATE meta SET "llmUsageRetentionMonths" = 12').then(() => { settled = true; });
     await new Promise(resolve => setTimeout(resolve, 30)); expect(settled).toBe(false);
    }
    return result;
   }) as typeof runner.query;
   const commit = runner.commitTransaction.bind(runner);
   runner.commitTransaction = async () => { await commit(); await extension; };
   return runner;
  } };
  await new LlmUsageService(wrapped as any).cleanup(new Date('2026-10-27Z'));
  expect(settled).toBe(true);
  expect((await db.query('SELECT requests::text FROM llm_usage_daily_total'))[0].requests).toBe('4');
  expect(await db.query('SELECT * FROM llm_usage_daily')).toHaveLength(4);
 });
 test('logical and physical deletion leave counters and distinct execution keys intact', async () => {
  await db.query("INSERT INTO \"user\" (id,username) VALUES ('existing','fixture')");
  await service.record({ ...input, userId: 'existing' });
  expect((await service.readUsers({ year: 2026, month: 10, sort: 'requests', offset: 0, limit: 30 })).items[0].user?.username).toBe('fixture');
  await db.query('UPDATE "user" SET "isDeleted" = true');
  expect((await service.readUsers({ year: 2026, month: 10, sort: 'requests', offset: 0, limit: 30 })).items[0].user).toBeNull();
  await db.query('DELETE FROM "user"');
  const overview = await service.readMonth(2026, 10);
  expect(overview.uniqueUsers).toBe('1'); expect(overview.summary.requests).toBe('1');
 });
 test('calendar days remain SQL dates in Tokyo rather than previous UTC day', async () => {
  const timezone = process.env.TZ;
  process.env.TZ = 'Asia/Tokyo';
  try {
   const [fixture] = await db.query("SELECT DATE '2026-04-30' AS date");
   expect(fixture.date).toBeInstanceOf(Date);
   expect(fixture.date.toISOString()).toBe('2026-04-29T15:00:00.000Z');
   await db.query('UPDATE meta SET "llmUsageRetentionMonths" = 6');
   await service.record({ ...input, completedAt: new Date('2026-04-30Z') });
   expect((await service.readMonth(2026, 4)).daily[0].date).toBe('2026-04-30');
   await service.cleanup(new Date('2026-10-27Z'));
   expect(await db.query('SELECT * FROM llm_usage_daily')).toHaveLength(0);
   expect(await db.query('SELECT * FROM llm_usage_daily_total')).toHaveLength(0);
  } finally { if (timezone === undefined) delete process.env.TZ; else process.env.TZ = timezone; }
 });
 test('cleanup remains exact with production int8 parser', async () => {
  await db.query('UPDATE meta SET "llmUsageRetentionMonths" = 6');
  await service.record({ ...input, completedAt: new Date('2026-04-30Z') });
  await db.query('UPDATE llm_usage_daily SET "totalTokens" = 9007199254740993');
  await db.query('UPDATE llm_usage_daily_total SET "totalTokens" = 9007199254740993');
  const parser = pg.types.getTypeParser(20);
  pg.types.setTypeParser(20, Number);
  try {
   await service.cleanup(new Date('2026-10-27Z'));
   expect(await db.query('SELECT * FROM llm_usage_daily')).toHaveLength(0);
   expect(await db.query('SELECT * FROM llm_usage_daily_total')).toHaveLength(0);
  } finally { pg.types.setTypeParser(20, parser); }
 });
 test('drift rolls back deletion rather than silently leaving a total', async () => {
  await db.query('UPDATE meta SET "llmUsageRetentionMonths" = 6');
  await service.record({ ...input, completedAt: new Date('2026-04-30Z') });
  await db.query('UPDATE llm_usage_daily_total SET requests = 2');
  await service.cleanup(new Date('2026-10-27Z'));
  expect((await db.query('SELECT requests FROM llm_usage_daily'))[0].requests).toBe('1');
  expect((await db.query('SELECT requests FROM llm_usage_daily_total'))[0].requests).toBe('2');
 });
 test('second-table constraint failure rolls back the first write', async () => {
  await db.query('ALTER TABLE llm_usage_daily ADD CONSTRAINT reject_fixture CHECK ("model" <> \'gemini-test\')');
  try { await service.record(input); expect(await db.query('SELECT * FROM llm_usage_daily_total')).toHaveLength(0); } finally { await db.query('ALTER TABLE llm_usage_daily DROP CONSTRAINT reject_fixture'); }
 });
 test('preserves integer sums above Number.MAX_SAFE_INTEGER', async () => {
  await service.record({ ...input, usage: { ...input.usage, total: Number.MAX_SAFE_INTEGER } });
  await service.record({ ...input, usage: { ...input.usage, total: Number.MAX_SAFE_INTEGER } });
  expect((await db.query('SELECT "totalTokens" FROM llm_usage_daily_total'))[0].totalTokens).toBe('18014398509481982');
 });
 test('real database overflow cannot replace generation response or original API error', async () => {
  await service.record({ ...input, userId: 'executor', completedAt: new Date() });
  await db.query('UPDATE llm_usage_daily SET "totalTokens" = 9223372036854775807');
  const fixture = { candidates: [], usageMetadata: { totalTokenCount: 20 } };
  const send = vi.fn().mockResolvedValue({ json: async () => fixture });
  const endpoint = new GenerationEndpoint({ serverGeminiEnabled: true, serverGeminiApiKey: 'fixture-only', serverGeminiModels: 'gemini-test' } as any, { send } as any, { getUserPolicies: async () => ({ canUseGeminiLLMAPI: true }) } as any, service);
  const params = { text: 'fixture', prompt: 'fixture' };
  expect(await endpoint.exec(params, { id: 'executor' } as any, null)).toEqual(fixture);
  const [total] = await db.query('SELECT requests::text FROM llm_usage_daily_total');
  expect(total.requests).toBe('1');
  await db.query('UPDATE llm_usage_daily SET requests = 9223372036854775807');
  send.mockClear().mockRejectedValue(new Error('fixture-original'));
  await expect(endpoint.exec(params, { id: 'executor' } as any, null)).rejects.toMatchObject({ code: 'LLM_API_ERROR', info: 'fixture-original' });
  expect(send).toHaveBeenCalledOnce();
  expect((await db.query('SELECT requests::text FROM llm_usage_daily_total'))[0].requests).toBe('1');
 });
 test('overflow rolls back both aggregates', async () => {
  await service.record(input);
  await db.query('UPDATE llm_usage_daily SET "totalTokens" = 9223372036854775807');
  await service.record(input);
  expect((await db.query('SELECT requests FROM llm_usage_daily_total'))[0].requests).toBe('1');
  expect((await db.query('SELECT requests FROM llm_usage_daily'))[0].requests).toBe('1');
 });
 test('statement timeout rolls back a slow insert without partial totals', async () => {
  await db.query("CREATE FUNCTION llm_usage_unit.slow_usage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(2); RETURN NEW; END $$");
  await db.query('CREATE TRIGGER slow_usage BEFORE INSERT ON llm_usage_daily FOR EACH ROW EXECUTE FUNCTION llm_usage_unit.slow_usage()');
  try { const start = Date.now(); await service.record(input); expect(Date.now() - start).toBeLessThan(1800); expect(await db.query('SELECT * FROM llm_usage_daily_total')).toHaveLength(0); } finally { await db.query('DROP TRIGGER slow_usage ON llm_usage_daily'); await db.query('DROP FUNCTION llm_usage_unit.slow_usage()'); }
 });
 test('real row-lock timeout returns without changing counters', async () => {
  await service.record(input);
  const lock = db.createQueryRunner(); await lock.connect(); await lock.startTransaction();
  try { await lock.query('SELECT * FROM llm_usage_daily_total FOR UPDATE'); const start = Date.now(); await service.record(input); expect(Date.now() - start).toBeLessThan(1500); } finally { await lock.rollbackTransaction(); await lock.release(); }
  expect((await db.query('SELECT requests FROM llm_usage_daily_total'))[0].requests).toBe('1');
 });
});
