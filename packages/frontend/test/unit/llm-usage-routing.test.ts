/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ api: vi.fn(), fetchInstance: vi.fn(), enabled: true, actions: vi.fn(), state: { geminiToken: 'personal-fixture', geminiModel: 'fixture-model', useGeminiLLMAPI: true, useGeminiWithMedia: false } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/instance.js', () => ({ fetchInstance: async () => ({ serverGeminiEnabled: mocks.enabled }) }));
vi.mock('@/store.js', () => ({ store: { s: {} } }));
vi.mock('@/preferences.js', () => ({ prefer: { s: mocks.state } }));
vi.mock('@/os.js', () => ({ actions: mocks.actions }));
vi.mock('@/utils/errorHandler.js', () => ({ displayLlmError: vi.fn() }));
beforeEach(() => { vi.resetModules(); mocks.api.mockReset().mockResolvedValue({ candidates: [] }); mocks.enabled = true; mocks.state.useGeminiLLMAPI = true; mocks.actions.mockResolvedValue({ canceled: false, result: 'fallback' }); });
for (const purpose of ['note-summary', 'profile-summary', 'text-transform', 'other'] as const) test(`server forwards ${purpose}`, async () => {
 const { generateGeminiSummary } = await import('@/utility/tempura-script/llm.js'); await Promise.resolve();
 await generateGeminiSummary({ userContent: 'fixture', purpose });
 expect(mocks.api).toHaveBeenCalledWith('notes/llm-gen', expect.objectContaining({ purpose }));
});
test('personal key and disabled-server fallback do not call the server', async () => {
 mocks.state.useGeminiLLMAPI = false;
 const fetcher = vi.spyOn(window, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ candidates: [] }) } as Response);
 try {
  const { generateGeminiSummary } = await import('@/utility/tempura-script/llm.js'); await Promise.resolve();
  await generateGeminiSummary({ userContent: 'fixture', purpose: 'text-transform' });
  expect(mocks.api).not.toHaveBeenCalled();
  vi.resetModules(); mocks.enabled = false; mocks.state.useGeminiLLMAPI = true;
  const fallback = await import('@/utility/tempura-script/llm.js'); await Promise.resolve();
  await fallback.generateGeminiSummary({ userContent: 'fixture', purpose: 'text-transform' });
  expect(mocks.api).not.toHaveBeenCalled();
 } finally { fetcher.mockRestore(); }
});
