/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { resolveProcessMode } from '@/boot/process-mode.js';

describe('resolveProcessMode', () => {
	test('zero selects single-process mode', () => {
		expect(resolveProcessMode(0, false)).toEqual({ singleProcess: true, workerCount: 0, invalidClusterLimit: false });
	});

	test.each([undefined, 1, 4])('clusters with limit %s', limit => {
		expect(resolveProcessMode(limit, false)).toEqual({ singleProcess: false, workerCount: limit ?? 1, invalidClusterLimit: false });
	});

	test.each([-1, -0.5, 1.5, NaN, Infinity])('invalid limit %s falls back to one worker', limit => {
		expect(resolveProcessMode(limit, false)).toEqual({ singleProcess: false, workerCount: 1, invalidClusterLimit: true });
	});

	test.each([undefined, 0, 1, 4, -1])('environment override disables clustering with limit %s', limit => {
		expect(resolveProcessMode(limit, true)).toMatchObject({ singleProcess: true, workerCount: 0 });
	});
});
