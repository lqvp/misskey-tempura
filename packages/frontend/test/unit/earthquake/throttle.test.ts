/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { prefer } from '@/preferences.js';
import { isThrottled, resetThrottleState } from '@/utility/tempura-script/earthquake/throttle.js';

function setPref(key: string, value: unknown): void {
	(prefer.s as unknown as Record<string, unknown>)[key] = value;
}

describe('earthquake/throttle', () => {
	beforeEach(() => {
		resetThrottleState();
		setPref('earthquakeWarningThrottleTime', 60);
	});

	afterEach(() => {
		vi.useRealTimers();
		resetThrottleState();
	});

	it('初回は抑制されない', () => {
		expect(isThrottled('event-1')).toBe(false);
	});

	it('同一イベントIDは抑制時間内に抑制される', () => {
		expect(isThrottled('event-1')).toBe(false);
		expect(isThrottled('event-1')).toBe(true);
	});

	it('異なるイベントIDは抑制されない', () => {
		expect(isThrottled('event-1')).toBe(false);
		expect(isThrottled('event-2')).toBe(false);
	});

	it('空のイベントIDは抑制されない', () => {
		expect(isThrottled('')).toBe(false);
	});

	it('抑制時間を超えると再び通知される', () => {
		vi.useFakeTimers();
		const now = Date.now();
		vi.setSystemTime(now);

		expect(isThrottled('event-1')).toBe(false);
		expect(isThrottled('event-1')).toBe(true);

		// 61 秒経過 (しきい値 60 秒を超過)
		vi.setSystemTime(now + 61_000);
		expect(isThrottled('event-1')).toBe(false);
	});
});
