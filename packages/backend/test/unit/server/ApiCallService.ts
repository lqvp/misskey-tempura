/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import { Readable } from 'node:stream';
import { describe, expect, test, vi } from 'vitest';
import { ApiCallService } from '@/server/api/ApiCallService.js';
import Logger from '@/logger.js';
import { envOption } from '@/env.js';
import { logManager } from '@/logging/logging-runtime.js';
import { PrettyConsoleBackend } from '@/logging/PrettyConsoleBackend.js';
import type { LogBackend } from '@/logging/LogBackend.js';
import type { LogRecord } from '@/logging/types.js';

const { createTempCleanupMock } = vi.hoisted(() => ({
	createTempCleanupMock: vi.fn(),
}));

vi.mock('@/misc/create-temp.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/misc/create-temp.js')>();
	return {
		...actual,
		createTemp: async () => {
			const [tempPath, originalCleanup] = await actual.createTemp();
			const wrappedCleanup = () => {
				createTempCleanupMock(tempPath);
				originalCleanup();
				fs.rmSync(tempPath, { force: true });
			};
			return [tempPath, wrappedCleanup] as [string, () => void];
		},
	};
});

/** API失敗ログを確認するための最小Fastify応答を作成します。 */
function createReply(raw?: EventEmitter & { writableEnded: boolean; destroyed: boolean }) {
	return {
		code: vi.fn(),
		header: vi.fn(),
		send: vi.fn(),
		...(raw != null ? { raw } : {}),
	};
}

function createRawReply(init: { writableEnded?: boolean; destroyed?: boolean } = {}) {
	return Object.assign(new EventEmitter(), {
		writableEnded: init.writableEnded ?? false,
		destroyed: init.destroyed ?? false,
	});
}

/** APIサービスの依存関係を最小限の仮実装へ差し替えます。 */
function createService() {
	const authenticateService = {
		authenticate: vi.fn().mockResolvedValue([null, null]),
	};
	const telemetryService = {
		startSpan: vi.fn((_name: string, callback: () => unknown) => callback()),
		captureMessage: vi.fn(),
	};
	const apiLoggerService = { logger: new Logger('api') };

	const service = new ApiCallService(
		{} as never,
		{} as never,
		{} as never,
		authenticateService as never,
		{} as never,
		{} as never,
		apiLoggerService as never,
		telemetryService as never,
		{} as never,
	);
	return { service, telemetryService };
}

describe('ApiCallService structured error logging', () => {
	test('redacts API credentials and serializes the endpoint error', async () => {
		const write = vi.fn<LogBackend['write']>();
		logManager.setBackend({ write });
		const previousQuiet = envOption.quiet;
		envOption.quiet = false;
		const { service, telemetryService } = createService();
		try {
			const reply = createReply();
			const endpoint = {
				name: 'notes/show',
				meta: {},
				params: {},
				exec: vi.fn().mockRejectedValue(new TypeError('broken endpoint')),
			};
			const request = {
				method: 'POST',
				body: {
					i: 'native-token',
					password: 'password',
					options: { visible: true },
				},
				query: {},
				headers: {},
				ip: '127.0.0.1',
			};

			await service.handleRequest(endpoint as never, request as never, reply as never);

			const record = write.mock.calls[0][0] as LogRecord;
			expect(record).toMatchObject({
				eventName: 'api.endpoint.failed',
				attributes: {
					'api.endpoint': 'notes/show',
					'api.params': {
						i: '[REDACTED]',
						password: '[REDACTED]',
						options: { visible: true },
					},
				},
				error: { type: 'TypeError', message: 'broken endpoint' },
			});
			expect(record.attributes?.['error.id']).toEqual(expect.any(String));
			expect(telemetryService.captureMessage.mock.calls[0][1].extra).not.toHaveProperty('ps');
		} finally {
			service.dispose();
			envOption.quiet = previousQuiet;
			logManager.setBackend(new PrettyConsoleBackend({ output: () => undefined }));
		}
	});
});

describe('ApiCallService client disconnect abort propagation', () => {
	function createPostRequest() {
		return {
			method: 'POST',
			body: { text: 'hello' },
			query: {},
			headers: {},
			ip: '127.0.0.1',
		};
	}

	test('does not abort the endpoint signal on normal POST completion (close with writableEnded: true)', async () => {
		const { service } = createService();
		try {
			const raw = createRawReply({ writableEnded: false, destroyed: false });
			const reply = createReply(raw);
			let capturedSignal: AbortSignal | undefined;
			const endpoint = {
				name: 'notes/llm-gen',
				meta: {},
				params: {},
				exec: vi.fn(async (_data, _user, _token, _file, _ip, _headers, signal?: AbortSignal) => {
					capturedSignal = signal;
					raw.writableEnded = true;
					raw.emit('close');
					return { ok: true };
				}),
			};

			await service.handleRequest(endpoint as never, createPostRequest() as never, reply as never);

			expect(capturedSignal).toBeInstanceOf(AbortSignal);
			expect(capturedSignal?.aborted).toBe(false);
			expect(reply.send).toHaveBeenCalledWith({ ok: true });
			expect(raw.listenerCount('close')).toBe(0);
		} finally {
			service.dispose();
		}
	});

	test('aborts the endpoint signal, detaches the listener, and finishes silently on client disconnect', async () => {
		const write = vi.fn<LogBackend['write']>();
		logManager.setBackend({ write });
		const previousQuiet = envOption.quiet;
		envOption.quiet = false;
		const { service, telemetryService } = createService();
		try {
			const raw = createRawReply({ writableEnded: false, destroyed: false });
			const reply = createReply(raw);
			let capturedSignal: AbortSignal | undefined;
			let finishExec!: (err: Error) => void;
			let markExecStarted!: () => void;
			const execStarted = new Promise<void>((resolve) => {
				markExecStarted = resolve;
			});
			const endpoint = {
				name: 'notes/llm-gen',
				meta: {},
				params: {},
				exec: vi.fn((_data, _user, _token, _file, _ip, _headers, signal?: AbortSignal) => {
					capturedSignal = signal;
					markExecStarted();
					return new Promise((_res, reject) => {
						finishExec = reject;
					});
				}),
			};

			const pending = service.handleRequest(endpoint as never, createPostRequest() as never, reply as never);
			await execStarted;

			expect(capturedSignal?.aborted).toBe(false);
			raw.destroyed = true;
			raw.emit('close');
			expect(capturedSignal?.aborted).toBe(true);

			finishExec(new DOMException('The operation was aborted.', 'AbortError'));
			await pending;

			expect(reply.send).not.toHaveBeenCalled();
			expect(reply.code).not.toHaveBeenCalled();
			expect(write).not.toHaveBeenCalled();
			expect(telemetryService.captureMessage).not.toHaveBeenCalled();
			expect(raw.listenerCount('close')).toBe(0);
		} finally {
			service.dispose();
			envOption.quiet = previousQuiet;
			logManager.setBackend(new PrettyConsoleBackend({ output: () => undefined }));
		}
	});

	test('skips sending a response if the client disconnects before exec resolves', async () => {
		const { service } = createService();
		try {
			const raw = createRawReply({ writableEnded: false, destroyed: false });
			const reply = createReply(raw);
			const endpoint = {
				name: 'notes/llm-gen',
				meta: {},
				params: {},
				exec: vi.fn(async () => {
					raw.destroyed = true;
					raw.emit('close');
					return { ok: true };
				}),
			};

			await service.handleRequest(endpoint as never, createPostRequest() as never, reply as never);

			expect(reply.send).not.toHaveBeenCalled();
			expect(raw.listenerCount('close')).toBe(0);
		} finally {
			service.dispose();
		}
	});

	test('handles already-destroyed reply.raw without invoking exec or leaking listeners', async () => {
		const { service } = createService();
		try {
			const raw = createRawReply({ writableEnded: false, destroyed: true });
			const reply = createReply(raw);
			const endpoint = {
				name: 'notes/llm-gen',
				meta: {},
				params: {},
				exec: vi.fn(),
			};

			await service.handleRequest(endpoint as never, createPostRequest() as never, reply as never);

			expect(endpoint.exec).not.toHaveBeenCalled();
			expect(reply.send).not.toHaveBeenCalled();
			expect(raw.listenerCount('close')).toBe(0);
		} finally {
			service.dispose();
		}
	});

	test('works with mock replies that omit reply.raw', async () => {
		const { service } = createService();
		try {
			const reply = createReply();
			let capturedSignal: AbortSignal | undefined;
			const endpoint = {
				name: 'notes/llm-gen',
				meta: {},
				params: {},
				exec: vi.fn(async (_data, _user, _token, _file, _ip, _headers, signal?: AbortSignal) => {
					capturedSignal = signal;
					return { ok: true };
				}),
			};

			await service.handleRequest(endpoint as never, createPostRequest() as never, reply as never);

			expect(capturedSignal).toBeInstanceOf(AbortSignal);
			expect(capturedSignal?.aborted).toBe(false);
			expect(reply.send).toHaveBeenCalledWith({ ok: true });
		} finally {
			service.dispose();
		}
	});

	test('still logs and reports non-AbortError thrown after client disconnect without sending a response', async () => {
		const write = vi.fn<LogBackend['write']>();
		logManager.setBackend({ write });
		const previousQuiet = envOption.quiet;
		envOption.quiet = false;
		const { service, telemetryService } = createService();
		try {
			const raw = createRawReply({ writableEnded: false, destroyed: false });
			const reply = createReply(raw);
			let capturedSignal: AbortSignal | undefined;
			let finishExec!: (err: Error) => void;
			let markExecStarted!: () => void;
			const execStarted = new Promise<void>((resolve) => {
				markExecStarted = resolve;
			});
			const endpoint = {
				name: 'notes/llm-gen',
				meta: {},
				params: {},
				exec: vi.fn((_data, _user, _token, _file, _ip, _headers, signal?: AbortSignal) => {
					capturedSignal = signal;
					markExecStarted();
					return new Promise((_res, reject) => {
						finishExec = reject;
					});
				}),
			};

			const pending = service.handleRequest(endpoint as never, createPostRequest() as never, reply as never);
			await execStarted;

			raw.destroyed = true;
			raw.emit('close');
			expect(capturedSignal?.aborted).toBe(true);

			finishExec(new Error('db failure'));
			await pending;

			expect(write).toHaveBeenCalledTimes(1);
			const record = write.mock.calls[0][0] as LogRecord;
			expect(record).toMatchObject({
				level: 'error',
				eventName: 'api.endpoint.failed',
				error: { type: 'Error', message: 'db failure' },
			});
			expect(telemetryService.captureMessage).toHaveBeenCalledTimes(1);
			expect(telemetryService.captureMessage).toHaveBeenCalledWith(
				'Internal error occurred in notes/llm-gen: db failure',
				expect.objectContaining({ level: 'error' }),
			);
			expect(reply.send).not.toHaveBeenCalled();
			expect(reply.code).not.toHaveBeenCalled();
			expect(raw.listenerCount('close')).toBe(0);
		} finally {
			service.dispose();
			envOption.quiet = previousQuiet;
			logManager.setBackend(new PrettyConsoleBackend({ output: () => undefined }));
		}
	});

	test('aborts signal, detaches listener, skips reply.send, and cleans up temp file on handleMultipartRequest client disconnect', async () => {
		createTempCleanupMock.mockClear();
		const write = vi.fn<LogBackend['write']>();
		logManager.setBackend({ write });
		const previousQuiet = envOption.quiet;
		envOption.quiet = false;
		const { service, telemetryService } = createService();
		let tempFilePath: string | undefined;
		try {
			const raw = createRawReply({ writableEnded: false, destroyed: false });
			const reply = createReply(raw);
			let capturedSignal: AbortSignal | undefined;
			let finishExec!: (err: Error) => void;
			let markExecStarted!: () => void;
			const execStarted = new Promise<void>((resolve) => {
				markExecStarted = resolve;
			});
			const endpoint = {
				name: 'drive/files/create',
				meta: { requireFile: true },
				params: {},
				exec: vi.fn((_data, _user, _token, file, _ip, _headers, signal?: AbortSignal) => {
					capturedSignal = signal;
					tempFilePath = file?.path;
					expect(tempFilePath).toEqual(expect.any(String));
					expect(fs.existsSync(tempFilePath!)).toBe(true);
					markExecStarted();
					return new Promise((_res, reject) => {
						finishExec = reject;
					});
				}),
			};
			const fileStream = Object.assign(Readable.from([Buffer.from('multipart payload')]), {
				truncated: false,
			});
			const request = {
				method: 'POST',
				headers: {},
				query: {},
				ip: '127.0.0.1',
				file: vi.fn().mockResolvedValue({
					file: fileStream,
					filename: 'upload.txt',
					fields: {},
				}),
			};

			const pending = service.handleMultipartRequest(endpoint as never, request as never, reply as never);
			await execStarted;

			expect(capturedSignal?.aborted).toBe(false);
			raw.destroyed = true;
			raw.emit('close');
			expect(capturedSignal?.aborted).toBe(true);

			finishExec(new DOMException('The operation was aborted.', 'AbortError'));
			await pending;

			expect(reply.send).not.toHaveBeenCalled();
			expect(reply.code).not.toHaveBeenCalled();
			expect(write).not.toHaveBeenCalled();
			expect(telemetryService.captureMessage).not.toHaveBeenCalled();
			expect(raw.listenerCount('close')).toBe(0);
			expect(createTempCleanupMock).toHaveBeenCalledTimes(1);
			expect(createTempCleanupMock).toHaveBeenCalledWith(tempFilePath);
			expect(fs.existsSync(tempFilePath!)).toBe(false);
		} finally {
			if (tempFilePath) {
				fs.rmSync(tempFilePath, { force: true });
			}
			service.dispose();
			envOption.quiet = previousQuiet;
			logManager.setBackend(new PrettyConsoleBackend({ output: () => undefined }));
		}
	});
});
