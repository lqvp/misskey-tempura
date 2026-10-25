/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { allSettled, trackPromise } from '@/misc/promise-tracker.js';

describe('promise-tracker', () => {
	test('a tracked rejected promise does not leak an unhandled rejection and is still drained', async () => {
		// NODE_ENV=test では trackPromise が実際に追跡する。以前は .finally の派生Promiseが
		// rejectを引き継いでunhandled rejectionになり、CIが "Unhandled Errors" で失敗した。
		// 再発した場合はこのテスト自体は通ってもvitestのrun全体が Unhandled Errors で落ちる。
		trackPromise(new Promise((_, reject) => setImmediate(() => reject(new Error('tracked failure')))));
		await allSettled();
		await expect(allSettled()).resolves.toBeUndefined();
	});

	test('a tracked resolved promise is drained', async () => {
		const spy = vi.fn(async () => 'ok');
		trackPromise(spy());
		await allSettled();
		expect(spy).toHaveBeenCalledTimes(1);
	});
});
