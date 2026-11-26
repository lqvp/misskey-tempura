/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getEventListeners } from 'node:events';
import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { StatusError } from '@/misc/status-error.js';
import type { Config } from '@/config.js';
import type { AddressInfo } from 'node:net';
import type { RequestInit, Response } from 'node-fetch';

const { fetchMock } = vi.hoisted(() => ({
	fetchMock: vi.fn(),
}));

vi.mock('node-fetch', () => ({
	default: fetchMock,
}));

function createService(): HttpRequestService {
	return new HttpRequestService({
		userAgent: 'MisskeyTest/1.0',
		proxy: undefined,
		proxyBypassHosts: [],
		allowedPrivateNetworks: [],
	} as unknown as Config);
}

function makeMockResponse(overrides: {
	ok?: boolean;
	status?: number;
	statusText?: string;
	body?: PassThrough | null;
} = {}): Response {
	return {
		ok: overrides.ok ?? true,
		status: overrides.status ?? 200,
		statusText: overrides.statusText ?? 'OK',
		body: overrides.body === undefined ? new PassThrough() : overrides.body,
	} as unknown as Response;
}

describe('HttpRequestService.send abort and timeout lifecycle', () => {
	let service: HttpRequestService;

	beforeEach(() => {
		service = createService();
		vi.useFakeTimers();
		fetchMock.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test('rejects immediately without calling fetch or leaving timers when args.signal is pre-aborted', async () => {
		const abortController = new AbortController();
		const reason = new DOMException('cancelled', 'AbortError');
		abortController.abort(reason);

		await expect(service.send('https://example.com/api', {
			timeout: 30_000,
			signal: abortController.signal,
		})).rejects.toBe(reason);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	test('immediately aborts fetch signal and clears timeout timer when args.signal aborts in-flight', async () => {
		const abortController = new AbortController();
		let fetchSignal: AbortSignal | undefined;

		fetchMock.mockImplementationOnce((_url: string, init?: RequestInit) => {
			fetchSignal = init?.signal as unknown as AbortSignal | undefined;
			return new Promise((_resolve, reject) => {
				fetchSignal?.addEventListener('abort', () => {
					reject(new DOMException('The operation was aborted.', 'AbortError'));
				}, { once: true });
			});
		});

		const pending = service.send('https://example.com/api', {
			timeout: 120_000,
			signal: abortController.signal,
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchSignal?.aborted).toBe(false);
		expect(vi.getTimerCount()).toBe(1);

		abortController.abort();

		expect(fetchSignal?.aborted).toBe(true);
		await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
		expect(vi.getTimerCount()).toBe(0);
	});

	test('keeps timeout active while response body streams and clears timer when body ends', async () => {
		const body = new PassThrough();
		let fetchSignal: AbortSignal | undefined;

		fetchMock.mockImplementationOnce(async (_url: string, init?: RequestInit) => {
			fetchSignal = init?.signal as unknown as AbortSignal | undefined;
			return makeMockResponse({ body });
		});

		const abortController = new AbortController();
		const res = await service.send('https://example.com/api', {
			timeout: 10_000,
			signal: abortController.signal,
		});

		expect(res.ok).toBe(true);
		// Timeout timer must stay active while caller is still reading the body
		expect(vi.getTimerCount()).toBe(1);
		expect(fetchSignal?.aborted).toBe(false);

		body.end('{"ok":true}');
		body.resume();
		await new Promise<void>(resolve => body.once('close', resolve));

		expect(vi.getTimerCount()).toBe(0);
		expect(fetchSignal?.aborted).toBe(false);
	});

	test('aborts combined signal when timeout expires during slow body read', async () => {
		const body = new PassThrough();
		let fetchSignal: AbortSignal | undefined;

		fetchMock.mockImplementationOnce(async (_url: string, init?: RequestInit) => {
			fetchSignal = init?.signal as unknown as AbortSignal | undefined;
			return makeMockResponse({ body });
		});

		const abortController = new AbortController();
		await service.send('https://example.com/api', {
			timeout: 5_000,
			signal: abortController.signal,
		});

		expect(fetchSignal?.aborted).toBe(false);
		vi.advanceTimersByTime(5_000);

		expect(fetchSignal?.aborted).toBe(true);
		expect(abortController.signal.aborted).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
		body.destroy();
	});

	test('clears timer immediately when response body is null', async () => {
		fetchMock.mockResolvedValueOnce(makeMockResponse({ body: null }));

		const res = await service.send('https://example.com/api', { timeout: 10_000 });

		expect(res.ok).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});

	test('clears timer and destroys body when throwErrorWhenResponseNotOk throws StatusError', async () => {
		const body = new PassThrough();
		fetchMock.mockResolvedValueOnce(makeMockResponse({
			ok: false,
			status: 502,
			statusText: 'Bad Gateway',
			body,
		}));

		await expect(service.send('https://example.com/api', { timeout: 10_000 }))
			.rejects.toBeInstanceOf(StatusError);

		expect(vi.getTimerCount()).toBe(0);
		expect(body.destroyed).toBe(true);
	});

	test('clears timer and destroys body when a response validator throws', async () => {
		const body = new PassThrough();
		fetchMock.mockResolvedValueOnce(makeMockResponse({ body }));

		await expect(service.send('https://example.com/api', { timeout: 10_000 }, {
			throwErrorWhenResponseNotOk: true,
			validators: [() => { throw new Error('invalid content-type'); }],
		})).rejects.toThrow('invalid content-type');

		expect(vi.getTimerCount()).toBe(0);
		expect(body.destroyed).toBe(true);
	});

	test('aborts internal controller on StatusError so abort listeners on caller and combined signals are removed', async () => {
		const externalController = new AbortController();
		const body = new PassThrough();
		let fetchSignal: AbortSignal | undefined;

		fetchMock.mockImplementationOnce(async (_url: string, init?: RequestInit) => {
			fetchSignal = init?.signal as unknown as AbortSignal | undefined;
			const abortAndFinalize = () => {
				body.emit('error', new DOMException('The operation was aborted.', 'AbortError'));
				fetchSignal?.removeEventListener('abort', abortAndFinalize);
			};
			fetchSignal?.addEventListener('abort', abortAndFinalize);
			return makeMockResponse({
				ok: false,
				status: 502,
				statusText: 'Bad Gateway',
				body,
			});
		});

		await expect(service.send('https://example.com/api', {
			timeout: 10_000,
			signal: externalController.signal,
		})).rejects.toBeInstanceOf(StatusError);

		expect(vi.getTimerCount()).toBe(0);
		expect(body.destroyed).toBe(true);
		expect(fetchSignal?.aborted).toBe(true);
		expect(externalController.signal.aborted).toBe(false);
		expect(getEventListeners(externalController.signal, 'abort')).toHaveLength(0);
		expect(getEventListeners(fetchSignal!, 'abort')).toHaveLength(0);
	});

	test('aborts internal controller on validator throw so abort listeners on caller and combined signals are removed', async () => {
		const externalController = new AbortController();
		const body = new PassThrough();
		let fetchSignal: AbortSignal | undefined;

		fetchMock.mockImplementationOnce(async (_url: string, init?: RequestInit) => {
			fetchSignal = init?.signal as unknown as AbortSignal | undefined;
			const abortAndFinalize = () => {
				body.emit('error', new DOMException('The operation was aborted.', 'AbortError'));
				fetchSignal?.removeEventListener('abort', abortAndFinalize);
			};
			fetchSignal?.addEventListener('abort', abortAndFinalize);
			return makeMockResponse({ body });
		});

		await expect(service.send('https://example.com/api', {
			timeout: 10_000,
			signal: externalController.signal,
		}, {
			throwErrorWhenResponseNotOk: true,
			validators: [() => { throw new Error('invalid content-type'); }],
		})).rejects.toThrow('invalid content-type');

		expect(vi.getTimerCount()).toBe(0);
		expect(body.destroyed).toBe(true);
		expect(fetchSignal?.aborted).toBe(true);
		expect(externalController.signal.aborted).toBe(false);
		expect(getEventListeners(externalController.signal, 'abort')).toHaveLength(0);
		expect(getEventListeners(fetchSignal!, 'abort')).toHaveLength(0);
	});

	test('clears timer when fetch rejects', async () => {
		fetchMock.mockRejectedValueOnce(new Error('network down'));

		await expect(service.send('https://example.com/api', { timeout: 10_000 }))
			.rejects.toThrow('network down');

		expect(vi.getTimerCount()).toBe(0);
	});

	test('tears down real TCP connection when caller signal aborts mid-body with real node-fetch', async () => {
		vi.useRealTimers();

		const { default: realFetch, AbortError } = await vi.importActual<typeof import('node-fetch')>('node-fetch');
		let fetchSignal: AbortSignal | undefined;
		fetchMock.mockImplementationOnce((url: Parameters<typeof realFetch>[0], init?: Parameters<typeof realFetch>[1]) => {
			fetchSignal = init?.signal as unknown as AbortSignal | undefined;
			return realFetch(url, init);
		});

		let resolveServerClosed!: () => void;
		const serverClosed = new Promise<void>(resolve => {
			resolveServerClosed = resolve;
		});
		let resClosed = false;
		let socketClosed = false;
		let closedBeforeEnd = false;
		let socketClosedBeforeEnd = false;

		const server = createServer((req, res) => {
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			res.write('partial ');

			const maybeResolve = () => {
				if (resClosed && socketClosed) {
					resolveServerClosed();
				}
			};

			res.once('close', () => {
				resClosed = true;
				closedBeforeEnd = !res.writableEnded;
				maybeResolve();
			});

			req.socket.once('close', () => {
				socketClosed = true;
				socketClosedBeforeEnd = !res.writableEnded;
				maybeResolve();
			});
		});

		let closeDeadlineTimer: ReturnType<typeof setTimeout> | undefined;
		try {
			await new Promise<void>((resolve, reject) => {
				server.once('error', reject);
				server.listen(0, '127.0.0.1', () => {
					server.off('error', reject);
					resolve();
				});
			});

			const { port } = server.address() as AddressInfo;
			const caller = new AbortController();

			const res = await service.send(`http://127.0.0.1:${port}/stream`, {
				signal: caller.signal,
				timeout: 10_000,
				isLocalAddressAllowed: true,
			});

			expect(res.ok).toBe(true);
			const body = res.body;
			expect(body).not.toBeNull();
			if (body == null) {
				throw new Error('Expected response body');
			}

			let received = '';
			let resolveFirstChunk!: () => void;
			const firstChunkReceived = new Promise<void>(resolve => {
				resolveFirstChunk = resolve;
			});

			const readBody = (async () => {
				for await (const chunk of body) {
					received += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
					if (received === 'partial ') {
						resolveFirstChunk();
					}
				}
			})();

			await Promise.race([firstChunkReceived, readBody]);
			caller.abort();

			await expect(readBody).rejects.toBeInstanceOf(AbortError);
			expect(received).toBe('partial ');

			const closedPromptly = await Promise.race([
				serverClosed.then(() => true),
				new Promise<boolean>(resolve => {
					closeDeadlineTimer = setTimeout(() => resolve(false), 2_000);
					closeDeadlineTimer.unref();
				}),
			]);

			expect(closedPromptly).toBe(true);
			expect(closedBeforeEnd).toBe(true);
			expect(socketClosedBeforeEnd).toBe(true);
			expect(fetchSignal).toBeDefined();
			if (fetchSignal == null) {
				throw new Error('Expected fetch signal');
			}
			expect(fetchSignal.aborted).toBe(true);
			expect(getEventListeners(caller.signal, 'abort')).toHaveLength(0);
			expect(getEventListeners(fetchSignal, 'abort')).toHaveLength(0);
		} finally {
			if (closeDeadlineTimer != null) {
				clearTimeout(closeDeadlineTimer);
			}
			server.closeAllConnections();
			if (server.listening) {
				await new Promise<void>((resolve, reject) => {
					server.close(err => {
						if (err) {
							reject(err);
						} else {
							resolve();
						}
					});
				});
			}
		}
	});
});
