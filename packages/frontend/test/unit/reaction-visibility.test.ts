/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { ReactionVisibilityCache } from '@/utility/reaction-visibility.js';

describe('reaction visibility', () => {
	test('retains visible types on increases and rechecks decreases', async () => {
		const check = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
		const cache = new ReactionVisibilityCache(check);
		expect(await cache.getVisible({ a: 1 })).toEqual(new Set(['a']));
		expect(await cache.getVisible({ a: 2 })).toEqual(new Set(['a']));
		expect(check).toHaveBeenCalledTimes(1);
		expect(await cache.getVisible({ a: 1 })).toEqual(new Set());
		expect(check).toHaveBeenCalledTimes(2);
	});

	test('rechecks hidden types only when counts change', async () => {
		const check = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		const cache = new ReactionVisibilityCache(check);
		await cache.getVisible({ a: 1 });
		await cache.getVisible({ a: 1 });
		expect(check).toHaveBeenCalledTimes(1);
		expect(await cache.getVisible({ a: 2 })).toEqual(new Set(['a']));
	});

	test('clears removed and zero-count types and explicit invalidations', async () => {
		const check = vi.fn().mockResolvedValue(true);
		const cache = new ReactionVisibilityCache(check);
		await cache.getVisible({ a: 1 });
		expect(await cache.getVisible({})).toEqual(new Set());
		await cache.getVisible({ a: 1 });
		await cache.getVisible({ a: 0 });
		await cache.getVisible({ a: 1 });
		cache.clear();
		await cache.getVisible({ a: 1 });
		expect(check).toHaveBeenCalledTimes(4);
	});

	test('deduplicates in-flight increases and rechecks a negative result', async () => {
		let finish!: (visible: boolean) => void;
		const check = vi.fn().mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve; })).mockResolvedValue(true);
		const cache = new ReactionVisibilityCache(check);
		const first = cache.getVisible({ a: 1 });
		const second = cache.getVisible({ a: 2 });
		expect(check).toHaveBeenCalledTimes(1);
		finish(false);
		expect(await second).toEqual(new Set(['a']));
		await first;
		expect(check).toHaveBeenCalledTimes(2);
	});

	test('does not reuse an invalidated in-flight answer', async () => {
		let finish!: (visible: boolean) => void;
		const check = vi.fn().mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve; })).mockResolvedValue(false);
		const cache = new ReactionVisibilityCache(check);
		const old = cache.getVisible({ a: 2 });
		expect(await cache.getVisible({ a: 1 })).toEqual(new Set());
		finish(true);
		await old;
		expect(await cache.getVisible({ a: 1 })).toEqual(new Set());
	});

	test('retries errors rather than caching a fallback', async () => {
		const check = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(true);
		const cache = new ReactionVisibilityCache(check);
		await expect(cache.getVisible({ a: 1 })).rejects.toThrow('unavailable');
		expect(await cache.getVisible({ a: 1 })).toEqual(new Set(['a']));
	});
});
