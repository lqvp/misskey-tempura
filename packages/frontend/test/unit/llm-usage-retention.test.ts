/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { afterEach, expect, test, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/vue';
import { defineComponent, nextTick } from 'vue';
import XSettings from '@/pages/admin/tempura/sections/GeminiSettings.vue';
const { api, confirm, save, alert } = vi.hoisted(() => ({ api: vi.fn(), confirm: vi.fn(), save: vi.fn(), alert: vi.fn(async () => {}) }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: api }));
vi.mock('@/os.js', async original => ({ ...await original<Record<string, unknown>>(), confirm, alert, apiWithDialog: save }));
vi.mock('@/instance.js', () => ({ instance: {}, fetchInstance: vi.fn(async () => ({})) }));
const input = defineComponent({ props: ['modelValue', 'type'], emits: ['update:modelValue'], template: '<label><slot name="label"/><input :value="modelValue" @input="$emit(\'update:modelValue\', type === \'number\' ? Number($event.target.value) : $event.target.value)" /></label>' });
const footer = defineComponent({ props: ['form'], template: '<button @click="form.save">save-fixture</button>' });

async function flush() { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick(); } }

function mountPage() { return render(XSettings, { props: { meta: { llmUsageRetentionMonths: 12, serverGeminiEnabled: true, serverGeminiApiKey: '', serverGeminiModels: 'gemini-fixture' } as never }, global: { stubs: { MkInput: input, MkSwitch: true, MkSelect: true, MkA: true, MkFolder: { template: '<section><slot/><slot name="footer"/></section>' }, MkFormFooter: footer } } }); }

afterEach(() => { cleanup(); api.mockReset(); confirm.mockReset(); save.mockReset(); alert.mockClear(); vi.useRealTimers(); });
test('cancel keeps the edited form and sends no update', async () => {
 api.mockImplementation(async (endpoint: string) => endpoint === 'ping' ? { pong: Date.parse('2026-10-31T23:59:59Z') } : { llmUsageRetentionMonths: 12 }); confirm.mockResolvedValue({ canceled: true });
 const page = mountPage(); await fireEvent.update(page.container.querySelectorAll('input')[1]!, '6'); await flush(); await fireEvent.click(page.getByText('save-fixture')); await flush();
 expect(save).not.toHaveBeenCalled(); expect((page.container.querySelectorAll('input')[1] as HTMLInputElement).value).toBe('6'); expect(page.getByText('save-fixture')).toBeTruthy();
});
test('confirmation uses server UTC month even when the client clock differs', async () => {
 vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T23:59:59Z'));
 api.mockImplementation(async (endpoint: string) => endpoint === 'ping' ? { pong: Date.parse('2026-11-01T00:00:01Z') } : { llmUsageRetentionMonths: 12 });
 confirm.mockResolvedValue({ canceled: false }); save.mockResolvedValue(undefined);
 const page = mountPage(); await fireEvent.update(page.container.querySelectorAll('input')[1]!, '6'); await flush(); await fireEvent.click(page.getByText('save-fixture')); await flush();
 expect(confirm).toHaveBeenCalledTimes(1); expect(confirm.mock.calls[0][0].text).toContain('2026-06-01');
 expect(save).toHaveBeenCalledWith('admin/update-meta', expect.objectContaining({ llmUsageRetentionMonths: 6, expectedLlmUsageRetentionMonths: 12, expectedLlmUsageRetentionBoundary: '2026-06-01' }), undefined, expect.any(Object));
});
test('a concurrent retention change stops saving other settings and refreshes the baseline', async () => {
 api.mockResolvedValue({ llmUsageRetentionMonths: 24 });
 const page = mountPage(); await fireEvent.update(page.container.querySelectorAll('input')[1]!, '6'); await flush(); await fireEvent.click(page.getByText('save-fixture')); await flush();
 expect(save).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled(); expect(alert).toHaveBeenCalledTimes(1); expect((page.container.querySelectorAll('input')[1] as HTMLInputElement).value).toBe('6');
});

test('CAS rejection refreshes retention without automatically resending the update', async () => {
 api.mockImplementation(async (endpoint: string) => endpoint === 'ping' ? { pong: Date.parse('2026-10-31T23:59:59Z') } : { llmUsageRetentionMonths: api.mock.calls.filter(([name]) => name === 'admin/meta').length === 1 ? 12 : 24 });
 confirm.mockResolvedValue({ canceled: false }); save.mockRejectedValue({ code: 'RETAINED_SETTINGS_CHANGED' });
 const page = mountPage(); await fireEvent.update(page.container.querySelectorAll('input')[1]!, '6'); await flush();
 // The UI event boundary intentionally reports errors from apiWithDialog. Invoke the reviewed form directly to inspect the rejection.
 const component = (page.container.querySelector('button') as unknown as { __vueParentComponent: { props: { form: { save(): Promise<void> } } } }).__vueParentComponent;
 await expect(component.props.form.save()).rejects.toEqual({ code: 'RETAINED_SETTINGS_CHANGED' });
 expect(save).toHaveBeenCalledTimes(1); expect(api.mock.calls.filter(([name]) => name === 'admin/meta')).toHaveLength(2); expect(alert).not.toHaveBeenCalled();
 expect((page.container.querySelectorAll('input')[1] as HTMLInputElement).value).toBe('6');
});

test('CAS conflict refreshes unedited retention and a later save keeps the other admin value', async () => {
 api.mockResolvedValueOnce({ llmUsageRetentionMonths: 12 }).mockResolvedValue({ llmUsageRetentionMonths: 24 });
 save.mockRejectedValueOnce({ code: 'RETAINED_SETTINGS_CHANGED' }).mockResolvedValue(undefined);
 const page = mountPage(); await fireEvent.update(page.container.querySelectorAll('input')[0]!, '1'); await flush();
 const component = (page.container.querySelector('button') as unknown as { __vueParentComponent: { props: { form: { save(): Promise<void> } } } }).__vueParentComponent;
 await expect(component.props.form.save()).rejects.toEqual({ code: 'RETAINED_SETTINGS_CHANGED' });
 expect((page.container.querySelectorAll('input')[1] as HTMLInputElement).value).toBe('24');
 await component.props.form.save();
 expect(save).toHaveBeenLastCalledWith('admin/update-meta', expect.objectContaining({ llmUsageRetentionMonths: 24, expectedLlmUsageRetentionMonths: 24, serverGeminiApiKey: '1' }), undefined, expect.any(Object));
 expect(confirm).not.toHaveBeenCalled();
});

test('invalid retention displays a reason and never sends settings', async () => {
 api.mockImplementation(async (endpoint: string) => endpoint === 'ping' ? { pong: Date.parse('2026-10-31T23:59:59Z') } : { llmUsageRetentionMonths: 12 });
 const page = mountPage(); await fireEvent.update(page.container.querySelectorAll('input')[1]!, 'invalid'); await flush();
 const component = (page.container.querySelector('button') as unknown as { __vueParentComponent: { props: { form: { save(): Promise<void> } } } }).__vueParentComponent;
 await component.props.form.save();
 expect(alert).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
});

test.each([NaN, null, Infinity])('invalid server time %s stops without client-clock fallback', async pong => {
 api.mockImplementation(async (endpoint: string) => endpoint === 'ping' ? { pong } : { llmUsageRetentionMonths: 12 });
 const page = mountPage(); await fireEvent.update(page.container.querySelectorAll('input')[1]!, '6'); await flush(); await fireEvent.click(page.getByText('save-fixture')); await flush();
 expect(alert).toHaveBeenCalledTimes(1); expect(confirm).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
});

test('server month change after confirmation stops without automatically resending', async () => {
 api.mockImplementation(async (endpoint: string) => endpoint === 'ping' ? { pong: Date.parse('2026-10-31T23:59:59Z') } : { llmUsageRetentionMonths: 12 });
 confirm.mockResolvedValue({ canceled: false }); save.mockRejectedValueOnce({ code: 'RETENTION_BOUNDARY_CHANGED' });
 const page = mountPage(); await fireEvent.update(page.container.querySelectorAll('input')[1]!, '6'); await flush(); await fireEvent.click(page.getByText('save-fixture')); await flush();
 expect(save).toHaveBeenCalledTimes(1); expect(alert).not.toHaveBeenCalled();
 expect(save.mock.calls[0][3]['44670c6f-a32d-49d0-a5ba-93df7c3f25ea'].text).toContain('境界日'); expect(page.getByText('save-fixture')).toBeTruthy();
});

test('server time request failure stops saving', async () => {
 api.mockImplementation(async (endpoint: string) => { if (endpoint === 'ping') throw new Error('offline'); return { llmUsageRetentionMonths: 12 }; });
 const page = mountPage(); await fireEvent.update(page.container.querySelectorAll('input')[1]!, '6'); await flush(); await fireEvent.click(page.getByText('save-fixture')); await flush();
 expect(alert).toHaveBeenCalledTimes(1); expect(confirm).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
});

test('unlimited to finite retention requires server cutoff confirmation', async () => {
 api.mockImplementation(async (endpoint: string) => endpoint === 'ping' ? { pong: Date.parse('2027-01-01T00:00:00Z') } : { llmUsageRetentionMonths: 0 });
 confirm.mockResolvedValue({ canceled: true });
 const page = render(XSettings, { props: { meta: { llmUsageRetentionMonths: 0, serverGeminiEnabled: true, serverGeminiApiKey: '', serverGeminiModels: 'gemini-fixture' } as never }, global: { stubs: { MkInput: input, MkSwitch: true, MkSelect: true, MkA: true, MkFolder: { template: '<section><slot/><slot name="footer"/></section>' }, MkFormFooter: footer } } });
 await fireEvent.update(page.container.querySelectorAll('input')[1]!, '1'); await flush(); await fireEvent.click(page.getByText('save-fixture')); await flush();
 expect(confirm.mock.calls[0][0].text).toContain('2027-01-01'); expect(save).not.toHaveBeenCalled();
});
