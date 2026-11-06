/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import Endpoint from '@/server/api/endpoints/notes/llm-gen.js';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
function setup(response: unknown = { usageMetadata: { totalTokenCount: 20 } }) {
 const records: any[] = [];
 const record = vi.fn(async (input: unknown) => { records.push(input); });
 const settings = { serverGeminiEnabled: true, serverGeminiApiKey: 'private-fixture-key', serverGeminiModels: 'test-model' };
 const send = vi.fn().mockResolvedValue({ json: async () => response });
 const endpoint = new Endpoint(settings as any, { send } as any, { getUserPolicies: async () => ({ canUseGeminiLLMAPI: true }) } as any, { record } as any);
 return { settings, send, records, record, endpoint, run: (params: any = {}) => endpoint.exec({ text: 'private text', prompt: 'private prompt', ...params }, { id: 'executor' } as any, null) };
}
describe('server generation usage', () => {
 vi.spyOn(console, 'error').mockImplementation(() => {});
 test('keeps successful response and records normalized metadata once', async () => {
  const fixture = { candidates: [], usageMetadata: { totalTokenCount: 20 } };
  const { run, send, records } = setup(fixture);
  expect(await run()).toBe(fixture); expect(send).toHaveBeenCalledOnce();
  expect(records).toHaveLength(1); expect(records[0]).toMatchObject({ userId: 'executor', purpose: 'other', model: 'test-model', success: true, usage: { input: null, total: 20 } });
  expect(JSON.stringify(records)).not.toContain('private');
 });
 test.each(['http', 'json', 'timeout'])('records %s failure once and preserves the API error', async failure => {
  const { run, send, records } = setup();
  if (failure === 'json') send.mockResolvedValue({ json: async () => { throw new Error('bad json'); } });
  else send.mockRejectedValue(new Error(failure));
  await expect(run()).rejects.toMatchObject({ code: 'LLM_API_ERROR' });
  expect(send).toHaveBeenCalledOnce(); expect(records).toHaveLength(1); expect(records[0].success).toBe(false); expect(records[0].usage.total).toBeNull();
 });
 test('counts safety block as success and captures model before settings mutate', async () => {
  const { run, send, records, settings } = setup();
  send.mockImplementation(async () => { settings.serverGeminiModels = 'changed'; return { json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }) }; });
  await run({ purpose: 'text-transform' });
  expect(records[0]).toMatchObject({ purpose: 'text-transform', model: 'test-model', success: true });
 });
 test('does not record pre-send rejections', async () => {
  const { run, send, records, settings } = setup(); settings.serverGeminiEnabled = false;
  await expect(run()).rejects.toBeDefined(); expect(send).not.toHaveBeenCalled(); expect(records).toHaveLength(0);
 });
 test('statistics rejection cannot replace generation success or original failure', async () => {
  const { run, record, send } = setup({ candidates: [] }); record.mockRejectedValue(new Error('db offline'));
  expect(await run()).toEqual({ candidates: [] });
  send.mockRejectedValue(new Error('original failure'));
  await expect(run()).rejects.toMatchObject({ code: 'LLM_API_ERROR' });
 });
 test('rejects invalid purpose before sending and does not count empty input or missing key', async () => {
  const { run, records, send, settings } = setup();
  for (const params of [{ purpose: 'invalid' }, { text: '' }, { prompt: '' }]) await expect(run(params)).rejects.toBeDefined();
  settings.serverGeminiApiKey = ''; await expect(run()).rejects.toBeDefined();
  expect(records).toHaveLength(0); expect(send).not.toHaveBeenCalled();
 });
 test('uses UTC completion date across a month boundary', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T23:59:59Z'));
  const { run, records, send } = setup();
  send.mockImplementation(async () => { vi.setSystemTime(new Date('2026-11-01T00:00:01Z')); return { json: async () => ({}) }; });
  await run(); expect(records[0].completedAt.toISOString()).toBe('2026-11-01T00:00:01.000Z');
 });

});
