/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { describe, expect, test } from 'vitest';
import { moveNestedWidget, updateNestedWidget, getNestedWidgetRotationDelay } from '@/widgets/nested-widget.js';

const children = () => [{ id: 'a', name: 'clock', data: { size: 'small' } }, { id: 'b', name: 'calendar', data: {} }];

describe('nested widget editing', () => {
	test('updates by id after reordering, without changing the input snapshot', () => {
		const original = children();
		const reordered = moveNestedWidget(original, 'a', 1);
		const edited = updateNestedWidget(reordered, 'a', { size: 'large' });
		expect(edited).toEqual([{ id: 'b', name: 'calendar', data: {} }, { id: 'a', name: 'clock', data: { size: 'large' } }]);
		expect(original).toEqual([{ id: 'a', name: 'clock', data: { size: 'small' } }, { id: 'b', name: 'calendar', data: {} }]);
	});
	test('ignores a removed child and an out-of-range move', () => {
		expect(updateNestedWidget(children(), 'removed', {})).toEqual(children());
		expect(moveNestedWidget(children(), 'a', -1)).toEqual(children());
	});
	test.each([[0, null], [-1, null], [NaN, null], [Infinity, null], [0.001, 500], [0.5, 500], [10, 10000], [1e10, 2147483647]])('schedules only finite positive intervals: %s', (seconds, expected) => {
		expect(getNestedWidgetRotationDelay(seconds)).toBe(expected);
	});
});
