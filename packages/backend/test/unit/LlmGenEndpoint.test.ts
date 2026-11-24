/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import LlmGenEndpoint from '@/server/api/endpoints/notes/llm-gen.js';

// クライアント直指定モードの全体予算 (packages/frontend/src/utility/tempura-script/llm.ts)。
// バックエンドとフロントエンドは別パッケージなので値を複製する。片方だけ変えると
// サーバーが先に打ち切って課金だけ残るため、ここで整合を固定しておく。
const CLIENT_REQUEST_BUDGET_MS = 120_000;

const META = {
	serverOpenAIEnabled: true,
	serverOpenAIApiKey: 'test-key',
	serverOpenAIBaseURL: 'https://api.example.com/v1',
	serverOpenAIModels: 'test-model',
} as unknown as MiMeta;

const sendMock = vi.fn();

function makeEndpoint(): LlmGenEndpoint {
	return new LlmGenEndpoint(META, { send: sendMock } as unknown as HttpRequestService);
}

// この endpoint は requireCredential: true なので、ユーザーは非 null のローカルユーザーとして渡す
const USER = { id: 'user1' } as MiLocalUser;

function exec(endpoint: LlmGenEndpoint, params: Record<string, unknown>): Promise<any> {
	return endpoint.exec({ prompt: 'summarize', ...params }, USER, null);
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
async function captureError(promise: Promise<unknown>): Promise<{ code?: string; info?: unknown }> {
	return await promise.then(
		() => { throw new Error('expected the endpoint to reject'); },
		(error: { code?: string; info?: unknown }) => error,
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
