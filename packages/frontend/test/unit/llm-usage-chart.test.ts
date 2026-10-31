/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { afterEach, expect, test, vi } from 'vitest';
import { render, cleanup } from '@testing-library/vue';
import XChart from '@/pages/admin/llm-usage.chart.vue';
const { configurations, destroy, on, off } = vi.hoisted(() => ({ configurations: [] as any[], destroy: vi.fn(), on: vi.fn(), off: vi.fn() }));
vi.mock('chart.js', () => ({ Chart: class { constructor(_canvas: unknown, configuration: unknown) { configurations.push(configuration); } destroy = destroy; } }));
vi.mock('@/utility/init-chart.js', () => ({ initChart: vi.fn() }));
vi.mock('@/composables/use-chart-tooltip.js', () => ({ useChartTooltip: () => ({ handler: vi.fn() }) }));
vi.mock('@/theme.js', () => ({ themeManager: { on, off } }));
afterEach(() => { cleanup(); configurations.length = 0; destroy.mockClear(); on.mockClear(); off.mockClear(); });
const row = (date: string, value: string | null) => ({ date, requests: '1', tokens: { total: { value } } });
test('daily chart preserves real zero, unknown days and unsafe numbers as separate gaps', () => {
 const page = render(XChart, { props: { data: { year: 2026, month: 2, daily: [row('2026-02-01', '0'), row('2026-02-02', null), row('2026-02-03', '9007199254740993')], byPurpose: [] } as never } });
 const config = configurations[0];
 expect(config.type).toBe('line'); expect(config.data.labels).toHaveLength(28); expect(config.data.datasets[1].data.slice(0, 4)).toEqual([0, null, null, null]);
 expect(config.data.datasets.every((x: any) => x.spanGaps === false)).toBe(true);
 page.unmount(); expect(destroy).toHaveBeenCalledTimes(1); expect(off).toHaveBeenCalledWith('themeChanged', expect.any(Function));
});
test('purpose chart uses bars and replaces its old chart on theme changes', () => {
 render(XChart, { props: { purpose: true, data: { year: 2026, month: 10, daily: [], byPurpose: [{ purpose: 'other', requests: '1', tokens: { total: { value: '0' } } }] } as never } });
 expect(configurations[0].type).toBe('bar');
 on.mock.calls.find(x => x[0] === 'themeChanged')![1]();
 expect(destroy).toHaveBeenCalledTimes(1); expect(configurations).toHaveLength(2);
});
