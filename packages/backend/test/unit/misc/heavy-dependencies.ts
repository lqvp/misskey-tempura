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
	const createTransport = vi.fn();
	const sanitizeHtml = vi.fn();
	const got = vi.fn();
	const Upload = vi.fn();
	const importNodemailer = vi.fn(() => ({ createTransport }));
	const importSanitizeHtml = vi.fn(() => ({ default: sanitizeHtml }));
	const importGot = vi.fn(() => ({ default: got }));
	const importLibStorage = vi.fn(() => ({ Upload }));
	const imports = [importJuice, importWebAuthn, importHelpers, importNodemailer, importSanitizeHtml, importGot, importLibStorage];

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		vi.doMock('juice', importJuice);
		vi.doMock('@simplewebauthn/server', importWebAuthn);
		vi.doMock('@simplewebauthn/server/helpers', importHelpers);
		vi.doMock('nodemailer', importNodemailer);
		vi.doMock('sanitize-html', importSanitizeHtml);
		vi.doMock('got', importGot);
		vi.doMock('@aws-sdk/lib-storage', importLibStorage);
	});

	test('importing the loader module leaves all libraries unloaded', async () => {
		await import('@/misc/heavy-dependencies.js');
		for (const factory of imports) expect(factory).not.toHaveBeenCalled();
	});

	test.each([
		['loadNodemailer', importNodemailer, { createTransport }],
		['loadSanitizeHtml', importSanitizeHtml, { default: sanitizeHtml }],
		['loadGot', importGot, { default: got }],
		['loadLibStorage', importLibStorage, { Upload }],
	] as const)('%s memoizes its module without loading other libraries', async (name, factory, exports) => {
		const loaders = await import('@/misc/heavy-dependencies.js');
		const load = loaders[name];
		const promise = load();
		expect(load()).toBe(promise);
		await expect(promise).resolves.toMatchObject(exports);
		expect(factory).toHaveBeenCalledOnce();
		for (const other of imports.filter(it => it !== factory)) expect(other).not.toHaveBeenCalled();
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

	test.each([
		['juice', 'loadJuice'],
		['nodemailer', 'loadNodemailer'],
		['sanitize-html', 'loadSanitizeHtml'],
		['got', 'loadGot'],
		['@aws-sdk/lib-storage', 'loadLibStorage'],
		['@simplewebauthn/server', 'loadWebAuthn'],
		['@simplewebauthn/server/helpers', 'loadWebAuthn'],
	] as const)('preserves a %s import rejection in the memoized promise', async (pkg, name) => {
		vi.doMock(pkg, () => { throw new Error('dependency unavailable'); });
		const loaders = await import('@/misc/heavy-dependencies.js');
		const load = loaders[name];
		const promise = load();
		expect(load()).toBe(promise);
		await expect(promise).rejects.toThrow();
	});
});
