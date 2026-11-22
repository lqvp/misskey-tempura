/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Ajv from 'ajv';
import { describe, expect, test, vi } from 'vitest';
import { Endpoint } from './endpoint-base.js';

describe('Endpoint parameters', () => {
	const paramDef = {
		type: 'object',
		properties: {
			id: { type: 'string', format: 'misskey:id' },
			limit: { type: 'integer', default: 10 },
		},
		required: ['id'],
	} as const;

	const meta = { requireCredential: false } as const;

	class TestEndpoint extends Endpoint<typeof meta, typeof paramDef> {}

	test('compiles on first use, validates IDs, and reuses the validator with defaults', async () => {
		const compile = vi.spyOn(Ajv.default.prototype, 'compile');
		const callback = vi.fn(async (params) => params);
		const endpoint = new TestEndpoint(meta, paramDef, callback);

		expect(compile).not.toHaveBeenCalled();
		await expect(endpoint.exec({ id: 'invalid-id' }, null, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(callback).not.toHaveBeenCalled();
		expect(compile).toHaveBeenCalledTimes(1);
		await expect(endpoint.exec({ id: 'validId123' }, null, null)).resolves.toEqual({ id: 'validId123', limit: 10 });
		expect(compile).toHaveBeenCalledTimes(1);
	});

	test('all registered parameter schemas compile', async () => {
		await import('reflect-metadata');
		const { default: endpoints } = await import('./endpoints.js');
		const ajv = new Ajv.default({ useDefaults: true });
		ajv.addFormat('misskey:id', /^[a-zA-Z0-9]+$/);

		for (const { name, params } of endpoints) {
			expect(() => ajv.compile(params), name).not.toThrow();
		}
	});
});
