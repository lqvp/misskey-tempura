/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, test, expect, vi, beforeEach } from 'vitest';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import { computeServerOpenAIDestinationId } from '@/core/entities/MetaEntityService.js';
import { ApiError } from '@/server/api/error.js';
import LlmGenEndpoint from '@/server/api/endpoints/notes/llm-gen.js';

// クライアント直指定モードの全体予算 (packages/frontend/src/utility/tempura-script/llm.ts)。
// バックエンドとフロントエンドは別パッケージなので値を複製する。片方だけ変えると
// サーバーが先に打ち切って課金だけ残るため、ここで整合を固定しておく。
const CLIENT_REQUEST_BUDGET_MS = 120_000;

const DESTINATION_KEY = 'a'.repeat(64);

const META = {
	serverOpenAIEnabled: true,
	serverOpenAIApiKey: 'test-key',
	serverOpenAIBaseURL: 'https://api.example.com/v1',
	serverOpenAIModels: 'test-model',
	serverOpenAIDestinationKey: DESTINATION_KEY,
} as unknown as MiMeta;

const sendMock = vi.fn();

function makeEndpoint(metaOverrides: Partial<MiMeta> = {}): LlmGenEndpoint {
	const meta = { ...META, ...metaOverrides } as unknown as MiMeta;
	return new LlmGenEndpoint(meta, { send: sendMock } as unknown as HttpRequestService);
}

// この endpoint は requireCredential: true なので、ユーザーは非 null のローカルユーザーとして渡す
const USER = { id: 'user1' } as MiLocalUser;

function exec(endpoint: LlmGenEndpoint, params: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
	return endpoint.exec({ prompt: 'summarize', ...params }, USER, null, undefined, null, null, signal);
}

function okResponse(): Response {
	return { ok: true, status: 200, statusText: 'OK', json: async () => ({ text: 'ok' }) } as unknown as Response;
}

function errorResponse(status: number): Response {
	return { ok: false, status, statusText: String(status), json: async () => ({}) } as unknown as Response;
}

/** i 回目の送信に渡された timeout (send は (url, args, extra) の 3 引数で呼ばれる) */
function timeoutAt(index: number): number {
	return sendMock.mock.calls[index][1].timeout;
}

/**
 * ApiError はメッセージに {0} を埋め込まず info に実値を入れるので、詳細は info から読む
 */
async function captureError(promise: Promise<unknown>): Promise<{ code?: string; id?: string; httpStatusCode?: number; info?: unknown; name?: string }> {
	return await promise.then(
		() => { throw new Error('expected the endpoint to reject'); },
		(error: { code?: string; id?: string; httpStatusCode?: number; info?: unknown; name?: string }) => error,
	);
}

describe('notes/llm-gen upstream timeout', () => {
	beforeEach(() => {
		sendMock.mockReset();
	});

	test('uses an upstream timeout that is not shorter than the client budget', async () => {
		sendMock.mockResolvedValueOnce(okResponse());
		await exec(makeEndpoint(), { text: 'hello' });

		// 30 秒だった旧値では、生成が終わる前に abort して課金だけ発生していた
		expect(timeoutAt(0)).toBe(CLIENT_REQUEST_BUDGET_MS);
	});

	test('image fallback uses its own, shorter timeout so it cannot cascade past the budget', async () => {
		sendMock.mockResolvedValueOnce(errorResponse(400)).mockResolvedValueOnce(okResponse());
		const body = await exec(makeEndpoint(), { text: 'hello', fileUris: ['https://example.com/a.png'] });

		expect(sendMock).toHaveBeenCalledTimes(2);
		expect(body).toEqual({ text: 'ok' });
		// 再送は前回の残り時間を引き継がず、かつ合計が無限に伸びない
		expect(timeoutAt(1)).toBeLessThan(timeoutAt(0));
		expect(timeoutAt(0) + timeoutAt(1)).toBeLessThanOrEqual(CLIENT_REQUEST_BUDGET_MS * 2);
	});

	test('resends text-only once when the provider rejects images with 422', async () => {
		sendMock.mockResolvedValueOnce(errorResponse(422)).mockResolvedValueOnce(okResponse());
		await exec(makeEndpoint(), { text: 'hello', fileUris: ['https://example.com/a.png'] });

		expect(sendMock).toHaveBeenCalledTimes(2);
		// 2 回目は本文 (文字列) だけを送る = 画像を落として再試行している
		const secondBody = JSON.parse(sendMock.mock.calls[1][1].body);
		expect(secondBody.messages[1].content).toBe('hello');
		expect(JSON.parse(sendMock.mock.calls[0][1].body).messages[1].content).toEqual([
			{ type: 'text', text: 'hello' },
			{ type: 'image_url', image_url: { url: 'https://example.com/a.png' } },
		]);
	});

	test('does not resend when there are no images', async () => {
		sendMock.mockResolvedValueOnce(errorResponse(400));
		const error = await captureError(exec(makeEndpoint(), { text: 'hello' }));

		expect(error.code).toBe('LLM_API_ERROR');
		expect(error.info).toMatch(/400/);
		expect(sendMock).toHaveBeenCalledTimes(1);
	});

	test('does not resend for server errors, which may already have been billed', async () => {
		sendMock.mockResolvedValueOnce(errorResponse(500));
		const error = await captureError(exec(makeEndpoint(), { text: 'hello', fileUris: ['https://example.com/a.png'] }));

		expect(error.info).toMatch(/500/);
		expect(sendMock).toHaveBeenCalledTimes(1);
	});

	test('gives up after a single retry when the fallback is rejected too', async () => {
		sendMock.mockResolvedValueOnce(errorResponse(400)).mockResolvedValueOnce(errorResponse(400));
		const error = await captureError(exec(makeEndpoint(), { text: 'hello', fileUris: ['https://example.com/a.png'] }));

		expect(error.info).toMatch(/400/);

		// 再送は 1 回まで (無限リトライで課金され続けない)
		expect(sendMock).toHaveBeenCalledTimes(2);
	});
});

// NOTE: console はテスト環境 (slacc) が仮想化しており spy が観測できないため、
// ここでは呼び出し元へ返るエラーだけを対象にする
describe('notes/llm-gen error redaction', () => {
	beforeEach(() => {
		sendMock.mockReset();
	});

	test('does not leak the API key into the returned error message', async () => {
		sendMock.mockRejectedValueOnce(new Error('boom Bearer test-key'));
		const error = await captureError(exec(makeEndpoint(), { text: 'hello' }));

		expect(error.info).toMatch(/\[REDACTED\]/);
		expect(error.info).not.toMatch(/test-key/);
	});
});

describe('notes/llm-gen expectedDestinationId', () => {
	beforeEach(() => {
		sendMock.mockReset();
	});

	test('succeeds when expectedDestinationId matches the current server destination', async () => {
		sendMock.mockResolvedValueOnce(okResponse());
		const expectedDestinationId = computeServerOpenAIDestinationId(META);
		expect(expectedDestinationId).not.toBeNull();

		const result = await exec(makeEndpoint(), { text: 'hello', expectedDestinationId });

		expect(result).toEqual({ text: 'ok' });
		expect(sendMock).toHaveBeenCalledTimes(1);
	});

	test('rejects with LLM_DESTINATION_MISMATCH without sending when serverOpenAIBaseURL has changed', async () => {
		const previousDestinationId = computeServerOpenAIDestinationId(META);
		const changedEndpoint = makeEndpoint({ serverOpenAIBaseURL: 'https://other-llm.example.com/v1' });

		const error = await captureError(exec(changedEndpoint, {
			text: 'hello',
			expectedDestinationId: previousDestinationId,
		}));

		expect(error).toBeInstanceOf(ApiError);
		expect(error.code).toBe('LLM_DESTINATION_MISMATCH');
		expect(error.id).toBe('b47a1356-514c-4f34-b09d-0f4642f2a7b4');
		expect(error.httpStatusCode).toBe(409);
		expect(sendMock).not.toHaveBeenCalled();
	});

	test('rejects expectedDestinationId exceeding maxLength 64 with INVALID_PARAM without sending', async () => {
		const error = await captureError(exec(makeEndpoint(), {
			text: 'hello',
			expectedDestinationId: 'a'.repeat(65),
		}));

		expect(error).toBeInstanceOf(ApiError);
		expect(error.code).toBe('INVALID_PARAM');
		expect(sendMock).not.toHaveBeenCalled();
	});

	test('rejects empty string expectedDestinationId without sending', async () => {
		const error = await captureError(exec(makeEndpoint(), {
			text: 'hello',
			expectedDestinationId: '',
		}));

		expect(error.code).toBe('LLM_DESTINATION_MISMATCH');
		expect(error.httpStatusCode).toBe(409);
		expect(sendMock).not.toHaveBeenCalled();
	});

	test('rejects expectedDestinationId when serverOpenAIDestinationKey is null', async () => {
		const endpoint = makeEndpoint({ serverOpenAIDestinationKey: null });
		const error = await captureError(exec(endpoint, {
			text: 'hello',
			expectedDestinationId: '0123456789abcdef',
		}));

		expect(error.code).toBe('LLM_DESTINATION_MISMATCH');
		expect(error.httpStatusCode).toBe(409);
		expect(sendMock).not.toHaveBeenCalled();
	});

	test('rejects expectedDestinationId combined with user-specified baseUrl or apiKey', async () => {
		const expectedDestinationId = computeServerOpenAIDestinationId(META);

		const withBaseUrl = await captureError(exec(makeEndpoint(), {
			text: 'hello',
			baseUrl: 'https://custom.example.com/v1',
			apiKey: 'user-key',
			expectedDestinationId,
		}));
		expect(withBaseUrl.code).toBe('LLM_DESTINATION_MISMATCH');
		expect(withBaseUrl.httpStatusCode).toBe(409);

		const withApiKeyOnly = await captureError(exec(makeEndpoint(), {
			text: 'hello',
			apiKey: 'user-key',
			expectedDestinationId,
		}));
		expect(withApiKeyOnly.code).toBe('LLM_DESTINATION_MISMATCH');
		expect(withApiKeyOnly.httpStatusCode).toBe(409);
		expect(sendMock).not.toHaveBeenCalled();
	});

	test('keeps omitted or null expectedDestinationId backward-compatible', async () => {
		sendMock.mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(okResponse());

		await expect(exec(makeEndpoint(), { text: 'hello' })).resolves.toEqual({ text: 'ok' });
		await expect(exec(makeEndpoint(), { text: 'hello', expectedDestinationId: null })).resolves.toEqual({ text: 'ok' });
		expect(sendMock).toHaveBeenCalledTimes(2);
	});

	test('still throws LLM_NOT_ENABLED before destination check when server LLM is disabled', async () => {
		const endpoint = makeEndpoint({ serverOpenAIEnabled: false });
		const error = await captureError(exec(endpoint, {
			text: 'hello',
			expectedDestinationId: '0123456789abcdef',
		}));

		expect(error.code).toBe('LLM_NOT_ENABLED');
		expect(sendMock).not.toHaveBeenCalled();
	});

	test('matches whitespace-padded serverOpenAIBaseURL and trims the request URL', async () => {
		sendMock.mockResolvedValueOnce(okResponse());
		const paddedMeta = {
			...META,
			serverOpenAIBaseURL: '  https://api.example.com/v1/  ',
		} as unknown as MiMeta;
		const expectedDestinationId = computeServerOpenAIDestinationId(paddedMeta);
		const endpoint = new LlmGenEndpoint(paddedMeta, { send: sendMock } as unknown as HttpRequestService);

		await exec(endpoint, { text: 'hello', expectedDestinationId });

		expect(sendMock).toHaveBeenCalledTimes(1);
		expect(sendMock.mock.calls[0][0]).toBe('https://api.example.com/v1/chat/completions');
	});

	test('uses snapshotted server settings even if serverSettings mutates mid-request', async () => {
		const mutableMeta = { ...META } as unknown as MiMeta;
		const expectedDestinationId = computeServerOpenAIDestinationId(mutableMeta);
		const endpoint = new LlmGenEndpoint(mutableMeta, { send: sendMock } as unknown as HttpRequestService);

		sendMock
			.mockImplementationOnce(async () => {
				mutableMeta.serverOpenAIBaseURL = 'https://evil.example.com/v1';
				mutableMeta.serverOpenAIApiKey = 'rotated-key';
				return errorResponse(400);
			})
			.mockResolvedValueOnce(okResponse());

		await exec(endpoint, {
			text: 'hello',
			fileUris: ['https://example.com/a.png'],
			expectedDestinationId,
		});

		expect(sendMock).toHaveBeenCalledTimes(2);
		expect(sendMock.mock.calls[0][0]).toBe('https://api.example.com/v1/chat/completions');
		expect(sendMock.mock.calls[1][0]).toBe('https://api.example.com/v1/chat/completions');
		expect(sendMock.mock.calls[1][1].headers.Authorization).toBe('Bearer test-key');
	});
});

describe('notes/llm-gen abort propagation', () => {
	beforeEach(() => {
		sendMock.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('forwards the request AbortSignal to HttpRequestService.send', async () => {
		sendMock.mockResolvedValueOnce(okResponse());
		const abortController = new AbortController();

		await exec(makeEndpoint(), { text: 'hello' }, abortController.signal);

		expect(sendMock).toHaveBeenCalledTimes(1);
		expect(sendMock.mock.calls[0][1].signal).toBe(abortController.signal);
	});

	test('does not call send or wrap in LLM_API_ERROR when signal is already aborted', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const abortController = new AbortController();
		abortController.abort();

		const error = await captureError(exec(makeEndpoint(), { text: 'hello' }, abortController.signal));

		expect(sendMock).not.toHaveBeenCalled();
		expect(error.code).not.toBe('LLM_API_ERROR');
		expect(error.name).toBe('AbortError');
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	test('rethrows abort error without logging or wrapping in LLM_API_ERROR when aborted during first request', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const abortController = new AbortController();
		const abortError = new DOMException('The operation was aborted.', 'AbortError');
		sendMock.mockImplementationOnce(async () => {
			abortController.abort(abortError);
			throw abortError;
		});

		const error = await captureError(exec(makeEndpoint(), { text: 'hello' }, abortController.signal));

		expect(sendMock).toHaveBeenCalledTimes(1);
		expect(error).toBe(abortError);
		expect(error.code).not.toBe('LLM_API_ERROR');
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	test('skips the second image-fallback request when aborted before retry', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const abortController = new AbortController();
		sendMock.mockImplementationOnce(async () => {
			abortController.abort();
			return errorResponse(400);
		});

		const error = await captureError(exec(
			makeEndpoint(),
			{ text: 'hello', fileUris: ['https://example.com/a.png'] },
			abortController.signal,
		));

		expect(sendMock).toHaveBeenCalledTimes(1);
		expect(error.code).not.toBe('LLM_API_ERROR');
		expect(error.name).toBe('AbortError');
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	test('still wraps upstream timeout AbortError in LLM_API_ERROR when client signal is not aborted', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const abortController = new AbortController();
		sendMock.mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'));

		const error = await captureError(exec(makeEndpoint(), { text: 'hello' }, abortController.signal));

		expect(sendMock).toHaveBeenCalledTimes(1);
		expect(error.code).toBe('LLM_API_ERROR');
		expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
	});

	test('still logs and wraps non-AbortError in LLM_API_ERROR even when signal is aborted', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const abortController = new AbortController();
		sendMock.mockImplementationOnce(async () => {
			abortController.abort();
			throw new Error('unexpected parse bug test-key');
		});

		const error = await captureError(exec(makeEndpoint(), { text: 'hello' }, abortController.signal));

		expect(sendMock).toHaveBeenCalledTimes(1);
		expect(error).toBeInstanceOf(ApiError);
		expect(error.code).toBe('LLM_API_ERROR');
		expect(error.info).toBe('unexpected parse bug [REDACTED]');
		expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith('LLM API error:', 'unexpected parse bug [REDACTED]');
	});

	test('rethrows AbortError instead of wrapping StatusError when aborted on non-ok response', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const abortController = new AbortController();
		sendMock.mockImplementationOnce(async () => {
			abortController.abort();
			return errorResponse(500);
		});

		const error = await captureError(exec(makeEndpoint(), { text: 'hello' }, abortController.signal));

		expect(sendMock).toHaveBeenCalledTimes(1);
		expect(error.code).not.toBe('LLM_API_ERROR');
		expect(error.name).toBe('AbortError');
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	test('rethrows AbortError instead of wrapping StatusError when aborted on retried non-ok response', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const abortController = new AbortController();
		sendMock
			.mockResolvedValueOnce(errorResponse(400))
			.mockImplementationOnce(async () => {
				abortController.abort();
				return errorResponse(400);
			});

		const error = await captureError(exec(
			makeEndpoint(),
			{ text: 'hello', fileUris: ['https://example.com/a.png'] },
			abortController.signal,
		));

		expect(sendMock).toHaveBeenCalledTimes(2);
		expect(error.code).not.toBe('LLM_API_ERROR');
		expect(error.name).toBe('AbortError');
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});
});
