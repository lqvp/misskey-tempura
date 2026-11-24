/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { createRangeStream, handleRangeRequest } from './FileServerUtils.js';

describe('createRangeStream', () => {
	const size = 100;
	let dir: string;
	let file: string;

	beforeAll(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'misskey-range-'));
		file = path.join(dir, 'file.bin');
		fs.writeFileSync(file, Buffer.alloc(size));
	});

	afterAll(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	async function range(header: string) {
		const result = createRangeStream(header, size, file);
		if (result == null) return null;
		const closed = once(result.stream, 'close');
		result.stream.destroy();
		await closed;
		return { start: result.start, end: result.end, chunksize: result.chunksize };
	}

	test('start-end', async () => {
		expect(await range('bytes=10-19')).toEqual({ start: 10, end: 19, chunksize: 10 });
	});

	test('open-ended', async () => {
		expect(await range('bytes=90-')).toEqual({ start: 90, end: 99, chunksize: 10 });
	});

	test('end beyond size is clamped', async () => {
		expect(await range('bytes=90-1000')).toEqual({ start: 90, end: 99, chunksize: 10 });
	});

	test('suffix range', async () => {
		expect(await range('bytes=-10')).toEqual({ start: 90, end: 99, chunksize: 10 });
		expect(await range('bytes=-1000')).toEqual({ start: 0, end: 99, chunksize: 100 });
	});

	test('multiple ranges use the first one', async () => {
		expect(await range('bytes=0-9, 20-29')).toEqual({ start: 0, end: 9, chunksize: 10 });
	});

	test.each(['bytes=-', 'bytes=-0', 'bytes=abc', 'bytes=20-10', 'bytes=100-', 'bytes=1-2-3'])('invalid: %s', async (header) => {
		expect(await range(header)).toBeNull();
	});

	test('handleRangeRequest returns 416 with no-store and clears file headers on invalid range', async () => {
		const headers = new Map<string, unknown>([
			['Content-Type', 'image/png'],
			['Cache-Control', 'max-age=31536000, immutable'],
			['Content-Disposition', 'inline; filename="file.bin"'],
		]);
		const reply = {
			header: vi.fn((name: string, value: unknown) => {
				headers.set(name, value);
				return reply;
			}),
			removeHeader: vi.fn((name: string) => {
				headers.delete(name);
				return reply;
			}),
			code: vi.fn(() => reply),
		};

		const stream = handleRangeRequest(reply as any, 'bytes=100-', size, file);
		const chunks: Buffer[] = [];
		for await (const chunk of stream) {
			chunks.push(Buffer.from(chunk));
		}

		expect(reply.code).toHaveBeenCalledWith(416);
		expect(headers.get('Content-Range')).toBe(`bytes */${size}`);
		expect(headers.get('Accept-Ranges')).toBe('bytes');
		expect(headers.get('Cache-Control')).toBe('no-store');
		expect(headers.has('Content-Type')).toBe(false);
		expect(headers.has('Content-Disposition')).toBe(false);
		expect(Buffer.concat(chunks).length).toBe(0);
	});
});
