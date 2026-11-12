/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { afterEach, expect, test, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/vue';
import { nextTick } from 'vue';

async function flushPromises() { for (let i = 0; i < 6; i++) { await Promise.resolve(); await nextTick(); } }

import { defineComponent } from 'vue';
import XUsage from '@/pages/admin/llm-usage.vue';
import { i18n } from '@/i18n.js';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: api }));
vi.mock('@/i.js', async (original) => ({ ...await original<Record<string, unknown>>(), iAmAdmin: true }));
vi.mock('@/instance.js', () => ({ instance: {}, fetchInstance: vi.fn(async () => ({})) }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/pages/admin/llm-usage.chart.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/pages/admin/llm-usage.counters.vue', () => ({ default: { template: '<div />' } }));
const input = defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' });
const button = defineComponent({ template: '<button><slot /></button>' });
let wrapper: ReturnType<typeof render>;
afterEach(() => { cleanup(); api.mockReset(); });

function mountPage() {
 wrapper = render(XUsage, { global: { stubs: { MkInput: input, MkButton: button, MkInfo: { template: '<div><slot /></div>' }, MkFolder: { template: '<section><slot name="label"/><slot name="caption"/><slot/></section>' }, MkSelect: input, MkLoading: true, PageWithHeader: { props: ['tabs', 'tab'], emits: ['update:tab'], template: '<main><button v-for="item in tabs" @click="$emit(\'update:tab\', item.key)">{{ item.title }}</button><slot /></main>' }, MkKeyValue: { template: '<div><slot name="key" /><slot name="value" /></div>' }, MkFoldableSection: { template: '<section><slot name="header" /><slot /></section>' } } } });
 return wrapper;
}

const overview = (uniqueUsers: string) => ({ year: 2026, month: 10, startedAt: '2026-10-01T00:00:00.000Z', retentionMonths: 12, uniqueUsers, summary: { requests: '0', successes: '0', failures: '0', tokens: { total: { value: null, samples: '0' } } }, daily: [], byPurpose: [], byModel: [] });

test('a slow old month cannot replace a newer month, and month changes reset pagination', async () => {
 let resolveOld!: (value: unknown) => void;
 api.mockImplementation((endpoint: string) => endpoint.endsWith('/users') ? Promise.resolve({ items: [], hasMore: false }) : new Promise(resolve => { resolveOld = resolve; }));
 const page = mountPage();
 api.mockImplementation((endpoint: string) => Promise.resolve(endpoint.endsWith('/users') ? { items: [], hasMore: false } : overview('222')));
 await fireEvent.update(page.container.querySelector('input')!, '2026-09'); await flushPromises();
 expect(page.container.textContent).toContain('222');
 resolveOld(overview('111')); await flushPromises();
 expect(page.container.textContent).toContain('222'); expect(page.container.textContent).not.toContain('111');
 await fireEvent.click([...page.container.querySelectorAll('button')].find(x => x.textContent === i18n.ts._llmUsage.users)!); await flushPromises();
 expect(api).toHaveBeenCalledWith('admin/llm-usage/users', expect.objectContaining({ year: 2026, month: 9, offset: 0 }));
});

test('API failures are visible and reload recovers without an old error', async () => {
 api.mockRejectedValueOnce(new Error('fixture-read-failure'));
 const page = mountPage(); await flushPromises(); expect(page.container.textContent).toContain('fixture-read-failure');
 api.mockImplementation((endpoint: string) => Promise.resolve(endpoint.endsWith('/users') ? { items: [], hasMore: false } : overview('333')));
 await fireEvent.click([...page.container.querySelectorAll('button')].find(x => x.textContent?.includes(i18n.ts.reload))!); await flushPromises();
 expect(page.container.textContent).toContain('333'); expect(page.container.textContent).not.toContain('fixture-read-failure');
});

test('an older user page rejection cannot hide a newer month', async () => {
 let rejectOld!: (error: Error) => void;
 let userReads = 0;
 api.mockImplementation((endpoint: string) => {
  if (endpoint === 'meta') return Promise.resolve({});
  if (endpoint.endsWith('/overview')) return Promise.resolve(overview('444'));
  userReads++;
  if (userReads === 2) return new Promise((_, reject) => { rejectOld = reject; });
  return Promise.resolve({ items: [], hasMore: userReads === 1 });
 });
 const page = mountPage(); await flushPromises();
 await fireEvent.click([...page.container.querySelectorAll('button')].find(x => x.textContent === i18n.ts._llmUsage.users)!); await flushPromises();
 const next = [...page.container.querySelectorAll('button')].find(x => x.textContent?.trim() === i18n.ts.next)!;
 await fireEvent.click(next);
 await fireEvent.update(page.container.querySelector('input')!, '2026-09'); await flushPromises();
 rejectOld(new Error('stale-users-failure')); await flushPromises();
 expect(page.container.textContent).not.toContain('stale-users-failure');
 await fireEvent.click([...page.container.querySelectorAll('button')].find(x => x.textContent === i18n.ts.overview)!);
 expect(page.container.textContent).toContain('444');
});

test('shows the request summary before optional details in a page header layout', async () => {
 const full = overview('12');
 full.summary = { requests: '81', successes: '75', failures: '6', tokens: { total: { value: '9007199254740993', samples: '75' } } } as never;
 api.mockImplementation((endpoint: string) => Promise.resolve(endpoint.endsWith('/users') ? { items: [], hasMore: false } : full));
 const page = mountPage(); await flushPromises();
 expect(page.container.querySelector('main')).not.toBeNull();
 expect(page.container.querySelector('[data-testid="usage-summary"]')?.textContent).toContain('81');
 expect(page.container.querySelector('[data-testid="usage-summary"]')?.textContent).toContain('9,007,199,254,740,993');
});

for (const usersFailure of [false, true]) {
 test(`API object errors display their message for ${usersFailure ? 'users' : 'overview'}`, async () => {
  api.mockImplementation((endpoint: string) => {
   if (endpoint === 'meta') return Promise.resolve({});
   if (usersFailure && endpoint.endsWith('/overview')) return Promise.resolve(overview('12'));
   return Promise.reject({ message: 'fixture-permission-denied', code: 'PERMISSION_DENIED' });
  });
  const page = mountPage(); await flushPromises();
  if (usersFailure) { await fireEvent.click([...page.container.querySelectorAll('button')].find(x => x.textContent === i18n.ts._llmUsage.users)!); await flushPromises(); }
  expect(page.container.textContent).toContain('fixture-permission-denied');
  expect(page.container.textContent).not.toContain('[object Object]');
 });
}

for (const failure of [false, true]) {
 test(`user-list ${failure ? 'failure' : 'delay'} cannot hide an already loaded overview`, async () => {
  api.mockImplementation((endpoint: string) => {
   if (endpoint === 'meta') return Promise.resolve({});
   if (endpoint.endsWith('/overview')) return Promise.resolve(overview('777'));
   return failure ? Promise.reject({ message: 'users-only-failure' }) : new Promise(() => {});
  });
  const page = mountPage(); await flushPromises();
  expect(page.container.querySelector('[data-testid="usage-summary"]')?.textContent).toContain('777');
  expect(page.container.textContent).not.toContain('users-only-failure');
  await fireEvent.click([...page.container.querySelectorAll('button')].find(x => x.textContent === i18n.ts._llmUsage.users)!); await flushPromises();
  await fireEvent.click([...page.container.querySelectorAll('button')].find(x => x.textContent === i18n.ts.overview)!);
  expect(page.container.querySelector('[data-testid="usage-summary"]')?.textContent).toContain('777');
  expect(page.container.textContent).not.toContain('users-only-failure');
 });
}

test('defers users until their tab opens, caches tab revisits, and invalidates on month change', async () => {
 api.mockImplementation((endpoint: string) => Promise.resolve(endpoint.endsWith('/users') ? { items: [], hasMore: false } : overview('888')));
 const page = mountPage(); await flushPromises();
 const userCalls = () => api.mock.calls.filter(([endpoint]) => endpoint === 'admin/llm-usage/users');
 const clickTab = async (title: string) => { await fireEvent.click([...page.container.querySelectorAll('button')].find(x => x.textContent === title)!); await flushPromises(); };
 expect(userCalls()).toHaveLength(0);
 await fireEvent.update(page.container.querySelector('input')!, '2026-09'); await flushPromises();
 expect(userCalls()).toHaveLength(0);
 await clickTab(i18n.ts._llmUsage.users); expect(userCalls()).toHaveLength(1);
 await clickTab(i18n.ts.overview); await clickTab(i18n.ts._llmUsage.users); expect(userCalls()).toHaveLength(1);
 await fireEvent.update(page.container.querySelector('input')!, '2026-08'); await flushPromises();
 expect(userCalls()).toHaveLength(2);
 expect(userCalls()[1][1]).toMatchObject({ month: 8, offset: 0 });
 await clickTab(i18n.ts.overview);
 await fireEvent.update(page.container.querySelector('input')!, '2026-07'); await flushPromises();
 expect(userCalls()).toHaveLength(2);
 await clickTab(i18n.ts._llmUsage.users); expect(userCalls()).toHaveLength(3);
 expect(userCalls()[2][1]).toMatchObject({ month: 7, offset: 0 });
});

test('opening users before overview resolves fetches users exactly once afterward', async () => {
 let resolveOverview!: (value: unknown) => void;
 api.mockImplementation((endpoint: string) => endpoint.endsWith('/overview') ? new Promise(resolve => { resolveOverview = resolve; }) : Promise.resolve({ items: [], hasMore: false }));
 const page = mountPage();
 await fireEvent.click([...page.container.querySelectorAll('button')].find(x => x.textContent === i18n.ts._llmUsage.users)!); await flushPromises();
 expect(api.mock.calls.filter(([endpoint]) => endpoint === 'admin/llm-usage/users')).toHaveLength(0);
 resolveOverview(overview('999')); await flushPromises();
 expect(api.mock.calls.filter(([endpoint]) => endpoint === 'admin/llm-usage/users')).toHaveLength(1);
});

test('failed pagination hides rows from the previous page', async () => {
 api.mockImplementation((endpoint: string) => endpoint.endsWith('/overview') ? Promise.resolve(overview('12')) : Promise.resolve({ items: [{ userId: 'old-page-user', user: null, counters: { requests: '1' } }], hasMore: true }));
 const page = mountPage(); await flushPromises();
 await fireEvent.click([...page.container.querySelectorAll('button')].find(x => x.textContent === i18n.ts._llmUsage.users)!); await flushPromises();
 expect(page.container.textContent).toContain('old-page-user');
 api.mockRejectedValueOnce({ message: 'page-unavailable' });
 await fireEvent.click([...page.container.querySelectorAll('button')].find(x => x.textContent?.trim() === i18n.ts.next)!); await flushPromises();
 expect(page.container.textContent).toContain('page-unavailable');
 expect(page.container.textContent).not.toContain('old-page-user');
 api.mockResolvedValueOnce({ items: [{ userId: 'new-page-user', user: null, counters: { requests: '2' } }], hasMore: false });
 await fireEvent.click([...page.container.querySelectorAll('button')].find(x => x.textContent === i18n.ts.retry)!); await flushPromises();
 expect(page.container.textContent).toContain('new-page-user');
 expect(page.container.textContent).not.toContain('page-unavailable');
});
