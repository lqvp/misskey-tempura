/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { _adapters } from 'chart.js';
import '@/utility/chart-date-adapter.js';

const adapter = new _adapters._date({});
const t = new Date(2026, 0, 15, 13, 45, 30, 123).getTime();

describe('chart date adapter', () => {
	test('parse accepts numbers, dates and ISO strings', () => {
		expect(adapter.parse(t)).toBe(t);
		expect(adapter.parse(new Date(t))).toBe(t);
		expect(adapter.parse(new Date(t).toISOString())).toBe(t);
		expect(adapter.parse(null)).toBeNull();
		expect(adapter.parse('invalid')).toBeNull();
	});

	test('add / diff', () => {
		expect(adapter.add(t, 2, 'day')).toBe(new Date(2026, 0, 17, 13, 45, 30, 123).getTime());
		expect(adapter.add(t, 1, 'month')).toBe(new Date(2026, 1, 15, 13, 45, 30, 123).getTime());
		expect(adapter.diff(adapter.add(t, 3, 'hour'), t, 'hour')).toBe(3);
	});

	test('startOf / endOf', () => {
		expect(adapter.startOf(t, 'day')).toBe(new Date(2026, 0, 15).getTime());
		expect(adapter.startOf(t, 'isoWeek', 1)).toBe(new Date(2026, 0, 12).getTime());
		expect(adapter.endOf(t, 'hour')).toBe(new Date(2026, 0, 15, 13, 59, 59, 999).getTime());
		expect(adapter.startOf(t, 'millisecond')).toBe(t);
	});

	test('format', () => {
		expect(adapter.format(t, adapter.formats().year)).toBe('2026');
		expect(adapter.format(t, adapter.formats().day)).toBe('Jan 15');
	});
});
