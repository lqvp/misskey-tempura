/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { DownloadService } from '@/core/DownloadService.js';
import { createTemp } from '@/misc/create-temp.js';
import { StatusError } from '@/misc/status-error.js';
import type { Config } from '@/config.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import type { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';

describe('DownloadService lazy got', () => {
	let server: Server;
	let baseUrl: string;
	const loggerService = mockDeep<LoggerService>();
	loggerService.getLogger.mockReturnValue(mockDeep<Logger>());
	const service = new DownloadService(
		mockDeep<Config>({ maxFileSize: 1024, userAgent: 'test' }),
		{ getAgentForHttp: () => undefined, getAgentForHttps: () => undefined } as unknown as HttpRequestService,
		loggerService,
	);

	beforeAll(async () => {
		server = createServer((req, res) => {
			if (req.url === '/missing') {
				res.writeHead(404);
				res.end();
				return;
			}
			res.setHeader('Content-Disposition', 'attachment; filename="hello.txt"');
			res.end(req.url === '/empty' ? '' : 'Hello');
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		if (!address || typeof address === 'string') throw new Error('Missing server address');
		baseUrl = `http://127.0.0.1:${address.port}`;
	});

	afterAll(async () => {
		await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	});

	test('downloads a file and preserves the response filename', async () => {
		const [path, cleanup] = await createTemp();
		try {
			await expect(service.downloadUrl(`${baseUrl}/file`, path)).resolves.toEqual({ filename: 'hello.txt' });
			expect(await readFile(path, 'utf8')).toBe('Hello');
		} finally {
			cleanup();
		}
	});

	test('downloads an empty body on subsequent use', async () => {
		await expect(service.downloadTextFile(`${baseUrl}/empty`)).resolves.toBe('');
	});

	test('converts HTTP errors to StatusError', async () => {
		await expect(service.downloadTextFile(`${baseUrl}/missing`)).rejects.toBeInstanceOf(StatusError);
	});
});
