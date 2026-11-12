/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { retentionCutoff } from '@/core/llm-usage/utils.js';
import { api, signup, role, createAppToken } from '../utils.js';
let admin: any; let ordinary: any; let moderator: any;
beforeAll(async () => {
 admin = await signup({ username: 'admin' }); ordinary = await signup({ username: 'ordinary' }); moderator = await signup({ username: 'moderator' });
 const modRole = await role(admin, { name: 'moderator', isModerator: true });
 await api('admin/roles/assign', { roleId: modRole.id, userId: moderator.id }, admin);
});
describe('LLM usage admin boundary', () => {
 test('anonymous, ordinary and moderator cannot read usage', async () => {
  for (const user of [undefined, ordinary, moderator]) {
   const response = await api('admin/llm-usage/overview', { year: 2026, month: 10 }, user);
   expect(response.status).not.toBe(200);
  }
 });
 test('admin can read empty month but old scoped app tokens cannot', async () => {
  const result = await api('admin/llm-usage/overview', { year: 2026, month: 10 }, admin);
  expect(result.status).toBe(200); expect(result.body).toMatchObject({ timezone: 'UTC', uniqueUsers: '0', summary: { requests: '0', tokens: { total: { value: null, samples: '0' } } } });
  const old = await createAppToken(admin, ['read:admin:meta']);
  expect((await api('admin/llm-usage/overview', { year: 2026, month: 10 }, { token: old })).status).not.toBe(200);
  const scoped = await createAppToken(admin, ['read:admin:llm-usage']);
  expect((await api('admin/llm-usage/overview', { year: 2026, month: 10 }, { token: scoped })).status).toBe(200);
 });
 test('retention update uses compare-and-set and rejects stale or missing expectation', async () => {
  expect((await api('admin/update-meta', { llmUsageRetentionMonths: 6, expectedLlmUsageRetentionMonths: 12, expectedLlmUsageRetentionBoundary: retentionCutoff(new Date(), 6)! }, admin)).status).toBe(204);
  const stale = await api('admin/update-meta', { llmUsageRetentionMonths: 3, expectedLlmUsageRetentionMonths: 12 }, admin);
  expect(stale.status).toBe(400); expect((stale.body as any).error.code).toBe('RETAINED_SETTINGS_CHANGED');
  expect((await api('admin/update-meta', { llmUsageRetentionMonths: 1 }, admin)).status).toBe(400);
  expect((await api('admin/meta', {}, admin)).body).toMatchObject({ llmUsageRetentionMonths: 6 });
 });
 test('missing or mismatched server cutoff cannot save any settings', async () => {
  const current = (await api('admin/meta', {}, admin)).body as any;
  for (const boundary of [undefined, '0001-01-01']) {
   const result = await api('admin/update-meta', { llmUsageRetentionMonths: 1, expectedLlmUsageRetentionMonths: current.llmUsageRetentionMonths, expectedLlmUsageRetentionBoundary: boundary, serverGeminiEnabled: !current.serverGeminiEnabled }, admin);
   expect(result.status).toBe(400); expect((result.body as any).error.code).toBe('RETENTION_BOUNDARY_CHANGED');
   expect((await api('admin/meta', {}, admin)).body).toMatchObject({ llmUsageRetentionMonths: current.llmUsageRetentionMonths, serverGeminiEnabled: current.serverGeminiEnabled });
  }
 });
 test('simultaneous retention changes allow one commit and reject the stale writer', async () => {
  const current = (await api('admin/meta', {}, admin)).body as any;
  const results = await Promise.all([3, 9].map(months => api('admin/update-meta', { llmUsageRetentionMonths: months, expectedLlmUsageRetentionMonths: current.llmUsageRetentionMonths, expectedLlmUsageRetentionBoundary: retentionCutoff(new Date(), months)! }, admin)));
  expect(results.map(r => r.status).sort()).toEqual([204, 400]);
  const failed = results.find(r => r.status === 400)!;
  expect((failed.body as any).error.code).toBe('RETAINED_SETTINGS_CHANGED');
 });
 test('invalid retention values reject and unrelated settings need no expectation', async () => {
  for (const value of [-1, 1.5, 2147483648]) expect((await api('admin/update-meta', { llmUsageRetentionMonths: value, expectedLlmUsageRetentionMonths: 6 }, admin)).status).toBe(400);
  expect((await api('admin/update-meta', { serverGeminiEnabled: false }, admin)).status).toBe(204);
 });
});
