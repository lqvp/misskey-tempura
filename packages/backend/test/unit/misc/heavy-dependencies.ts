/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

describe('heavy dependency loaders', () => {
	const juice = vi.fn();
	const generateRegistrationOptions = vi.fn();
	const isoCBOR = { encode: vi.fn() };
	const isoUint8Array = { fromUTF8String: vi.fn() };
	const importJuice = vi.fn(() => ({ default: juice }));
	const importWebAuthn = vi.fn(() => ({ generateRegistrationOptions }));
	const importHelpers = vi.fn(() => ({ isoCBOR, isoUint8Array }));

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		vi.doMock('juice', importJuice);
		vi.doMock('@simplewebauthn/server', importWebAuthn);
		vi.doMock('@simplewebauthn/server/helpers', importHelpers);
	});

	test('importing the loader module leaves both libraries unloaded', async () => {
		await import('@/misc/heavy-dependencies.js');
		expect(importJuice).not.toHaveBeenCalled();
		expect(importWebAuthn).not.toHaveBeenCalled();
		expect(importHelpers).not.toHaveBeenCalled();
	});

	test('memoizes Juice without loading WebAuthn', async () => {
		const { loadJuice } = await import('@/misc/heavy-dependencies.js');
		const promise = loadJuice();
		expect(loadJuice()).toBe(promise);
		await expect(promise).resolves.toMatchObject({ default: juice });
		expect(importJuice).toHaveBeenCalledOnce();
		expect(importWebAuthn).not.toHaveBeenCalled();
		expect(importHelpers).not.toHaveBeenCalled();
	});

	test('memoizes WebAuthn and its helpers without loading Juice', async () => {
		const { loadWebAuthn } = await import('@/misc/heavy-dependencies.js');
		const promise = loadWebAuthn();
		expect(loadWebAuthn()).toBe(promise);
		await expect(promise).resolves.toMatchObject({ generateRegistrationOptions, isoCBOR, isoUint8Array });
		expect(importWebAuthn).toHaveBeenCalledOnce();
		expect(importHelpers).toHaveBeenCalledOnce();
		expect(importJuice).not.toHaveBeenCalled();
	});

	test('preserves an import rejection in the memoized promise', async () => {
		vi.doMock('juice', () => { throw new Error('dependency unavailable'); });
		const { loadJuice } = await import('@/misc/heavy-dependencies.js');
		const promise = loadJuice();
		expect(loadJuice()).toBe(promise);
		await expect(promise).rejects.toThrow();
	});
});
