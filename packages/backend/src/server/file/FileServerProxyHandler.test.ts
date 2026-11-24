/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { FileServerProxyHandler } from './FileServerProxyHandler.js';
import type { FileServerFileResolver } from './FileServerFileResolver.js';

describe('FileServerProxyHandler Range handling', () => {
	const payload = Buffer.from('0123456789abcdef0123456789abcdef');
	let dir: string;
	let filePath: string;

	beforeAll(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'misskey-proxy-range-'));
		filePath = path.join(dir, 'sample.png');
		fs.writeFileSync(filePath, payload);
	});

	afterAll(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	async function injectProxy(options: { range?: string; kind?: 'stored' | 'remote'; cleanup?: () => void }) {
		const cleanup = options.cleanup ?? vi.fn();
		const resolveFileByAccessKey = vi.fn().mockResolvedValue(
			options.kind === 'remote'
				? {
					kind: 'remote',
					fileRole: 'original',
					file: { size: payload.length },
					filename: 'sample.png',
					url: 'https://remote.example/sample.png',
					mime: 'image/png',
					ext: 'png',
					path: filePath,
					cleanup,
				}
				: {
					kind: 'stored',
					fileRole: 'original',
					file: { size: payload.length },
					filename: 'sample.png',
					mime: 'image/png',
					ext: 'png',
					path: filePath,
				},
		);

		const handler = new FileServerProxyHandler(
			{
				url: 'https://example.test',
				externalMediaProxyEnabled: false,
				mediaProxy: 'https://example.test/proxy',
			} as any,
			{ resolveFileByAccessKey } as unknown as FileServerFileResolver,
			dir,
			{} as any,
		);

		const app = Fastify();
		app.get<{ Params: { url: string }; Querystring: { url?: string } }>('/proxy/:url*', (req, reply) => {
			return handler.handle(req, reply);
		});

		try {
			const res = await app.inject({
				method: 'GET',
				url: `/proxy/sample.png?url=${encodeURIComponent('https://example.test/files/testkey')}`,
				headers: {
					'user-agent': 'Mozilla/5.0',
					...(options.range != null ? { range: options.range } : {}),
				},
			});
			return { res, cleanup };
		} finally {
			await app.close();
		}
	}

	test('有効な Range リクエストに対して 206 部分応答を返す', async () => {
		const { res } = await injectProxy({ range: 'bytes=0-3' });

		expect(res.statusCode).toBe(206);
		expect(res.headers['content-range']).toBe(`bytes 0-3/${payload.length}`);
		expect(res.headers['accept-ranges']).toBe('bytes');
		expect(res.headers['content-length']).toBe('4');
		expect(res.headers['cache-control']).toBe('max-age=31536000, immutable');
		expect(res.headers['content-type']).toBe('image/png');
		expect(res.rawPayload).toEqual(payload.subarray(0, 4));
	});

	test.each(['bytes=999-', 'bytes=20-10', 'bytes=-0', 'bytes=abc'])(
		'無効または範囲外の Range (%s) に対して 416 を返し、全体転送や長期キャッシュを行わない',
		async (range) => {
			const cleanup = vi.fn();
			const { res } = await injectProxy({ range, kind: 'remote', cleanup });

			expect(res.statusCode).toBe(416);
			expect(res.headers['content-range']).toBe(`bytes */${payload.length}`);
			expect(res.headers['accept-ranges']).toBe('bytes');
			expect(res.headers['cache-control']).toBe('no-store');
			expect(res.headers['content-disposition']).toBeUndefined();
			expect(res.rawPayload.length).toBe(0);
			expect(cleanup).toHaveBeenCalled();
		},
	);
});
