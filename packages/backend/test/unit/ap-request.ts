/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { URL } from 'node:url';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import httpSignature from '@peertube/http-signature';

import { genRsaKeyPair } from '@/misc/gen-key-pair.js';
import { ApRequestCreator, ApRequestService } from '@/core/activitypub/ApRequestService.js';
import { assertActivityMatchesUrl, FetchAllowSoftFailMask } from '@/core/activitypub/misc/check-against-url.js';
import { StatusError } from '@/misc/status-error.js';
import type { IObject } from '@/core/activitypub/type.js';
import type { Config } from '@/config.js';
import type { UserKeypairService } from '@/core/UserKeypairService.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import type { LoggerService } from '@/core/LoggerService.js';
import type { UtilityService } from '@/core/UtilityService.js';
import type { Response } from 'node-fetch';

export const buildParsedSignature = (signingString: string, signature: string, algorithm: string) => {
	return {
		scheme: 'Signature',
		params: {
			keyId: 'KeyID',	// dummy, not used for verify
			algorithm: algorithm,
			headers: ['(request-target)', 'date', 'host', 'digest'],	// dummy, not used for verify
			signature: signature,
		},
		signingString: signingString,
		algorithm: algorithm.toUpperCase(),
		keyId: 'KeyID',	// dummy, not used for verify
	};
};

function cartesianProduct<T, U>(a: T[], b: U[]): [T, U][] {
	return a.flatMap(a => b.map(b => [a, b] as [T, U]));
}

describe('ap-request', () => {
	test('createSignedPost with verify', async () => {
		const keypair = await genRsaKeyPair();
		const key = { keyId: 'x', 'privateKeyPem': keypair.privateKey };
		const url = 'https://example.com/inbox';
		const activity = { a: 1 };
		const body = JSON.stringify(activity);
		const headers = {
			'User-Agent': 'UA',
		};

		const req = await ApRequestCreator.createSignedPost({ key, url, body, additionalHeaders: headers });

		const parsed = buildParsedSignature(req.signingString, req.signature, 'rsa-sha256');

		const result = httpSignature.verifySignature(parsed, keypair.publicKey);
		assert.deepStrictEqual(result, true);
	});

	test('createSignedGet with verify', async () => {
		const keypair = await genRsaKeyPair();
		const key = { keyId: 'x', 'privateKeyPem': keypair.privateKey };
		const url = 'https://example.com/outbox';
		const headers = {
			'User-Agent': 'UA',
		};

		const req = await ApRequestCreator.createSignedGet({ key, url, additionalHeaders: headers });

		const parsed = buildParsedSignature(req.signingString, req.signature, 'rsa-sha256');

		const result = httpSignature.verifySignature(parsed, keypair.publicKey);
		assert.deepStrictEqual(result, true);
	});

	test('createSignedGet includes query string in request-target', async () => {
		const keypair = await genRsaKeyPair();
		const key = { keyId: 'x', 'privateKeyPem': keypair.privateKey };
		const url = 'https://example.com/users/alice?page=2';

		const req = await ApRequestCreator.createSignedGet({ key, url, additionalHeaders: { 'User-Agent': 'UA' } });

		assert.ok(req.signingString.split('\n').includes('(request-target): get /users/alice?page=2'));

		const parsed = buildParsedSignature(req.signingString, req.signature, 'rsa-sha256');
		assert.deepStrictEqual(httpSignature.verifySignature(parsed, keypair.publicKey), true);
	});

	test('createSignedPost includes query string in request-target', async () => {
		const keypair = await genRsaKeyPair();
		const key = { keyId: 'x', 'privateKeyPem': keypair.privateKey };
		const url = 'https://example.com/inbox?token=abc';
		const body = JSON.stringify({ a: 1 });

		const req = await ApRequestCreator.createSignedPost({
			key,
			url,
			body,
			additionalHeaders: { 'User-Agent': 'UA' },
		});

		assert.ok(req.signingString.split('\n').includes('(request-target): post /inbox?token=abc'));

		const parsed = buildParsedSignature(req.signingString, req.signature, 'rsa-sha256');
		assert.deepStrictEqual(httpSignature.verifySignature(parsed, keypair.publicKey), true);
	});

	test('request-target omits hash and preserves empty query delimiter', async () => {
		const keypair = await genRsaKeyPair();
		const key = { keyId: 'x', 'privateKeyPem': keypair.privateKey };

		const withHash = await ApRequestCreator.createSignedGet({
			key,
			url: 'https://example.com/users/alice?page=2#ignored',
			additionalHeaders: { 'User-Agent': 'UA' },
		});
		assert.ok(withHash.signingString.split('\n').includes('(request-target): get /users/alice?page=2'));

		const emptyQueryWithHash = await ApRequestCreator.createSignedGet({
			key,
			url: 'https://example.com/outbox?#ignored',
			additionalHeaders: { 'User-Agent': 'UA' },
		});
		assert.ok(emptyQueryWithHash.signingString.split('\n').includes('(request-target): get /outbox?'));

		const emptyQuery = await ApRequestCreator.createSignedGet({
			key,
			url: 'https://example.com/outbox?',
			additionalHeaders: { 'User-Agent': 'UA' },
		});
		assert.ok(emptyQuery.signingString.split('\n').includes('(request-target): get /outbox?'));

		const withoutQuery = await ApRequestCreator.createSignedGet({
			key,
			url: 'https://example.com/outbox',
			additionalHeaders: { 'User-Agent': 'UA' },
		});
		assert.ok(withoutQuery.signingString.split('\n').includes('(request-target): get /outbox'));
	});

	test('rejects non matching domain', () => {
		assert.doesNotThrow(() => assertActivityMatchesUrl(
			'https://alice.example.com/abc',
			{ id: 'https://alice.example.com/abc' } as IObject,
			'https://alice.example.com/abc',
			FetchAllowSoftFailMask.Strict,
		), 'validation should pass base case');
		assert.throws(() => assertActivityMatchesUrl(
			'https://alice.example.com/abc',
			{ id: 'https://bob.example.com/abc' } as IObject,
			'https://alice.example.com/abc',
			FetchAllowSoftFailMask.Any,
		), 'validation should fail no matter what if the response URL is inconsistent with the object ID');

		assert.doesNotThrow(() => assertActivityMatchesUrl(
			'https://alice.example.com/abc#test',
			{ id: 'https://alice.example.com/abc' } as IObject,
			'https://alice.example.com/abc',
			FetchAllowSoftFailMask.Strict,
		), 'validation should pass with hash in request URL');

		// fix issues like threads
		// https://github.com/misskey-dev/misskey/issues/15039
		const withOrWithoutWWW = [
			'https://alice.example.com/abc',
			'https://www.alice.example.com/abc',
		];

		cartesianProduct(
			cartesianProduct(
				withOrWithoutWWW,
				withOrWithoutWWW,
			),
			withOrWithoutWWW,
		).forEach(([[a, b], c]) => {
			assert.doesNotThrow(() => assertActivityMatchesUrl(
				a,
				{ id: b } as IObject,
				c,
				FetchAllowSoftFailMask.Strict,
			), 'validation should pass with or without www. subdomain');
		});
	});

	test('cross origin lookup', () => {
		assert.doesNotThrow(() => assertActivityMatchesUrl(
			'https://alice.example.com/abc',
			{ id: 'https://bob.example.com/abc' } as IObject,
			'https://bob.example.com/abc',
			FetchAllowSoftFailMask.CrossOrigin | FetchAllowSoftFailMask.NonCanonicalId,
		), 'validation should pass if the response is otherwise consistent and cross-origin is allowed');
		assert.throws(() => assertActivityMatchesUrl(
			'https://alice.example.com/abc',
			{ id: 'https://bob.example.com/abc' } as IObject,
			'https://bob.example.com/abc',
			FetchAllowSoftFailMask.Strict,
		), 'validation should fail if the response is otherwise consistent and cross-origin is not allowed');
	});

	test('rejects non-canonical ID', () => {
		assert.throws(() => assertActivityMatchesUrl(
			'https://alice.example.com/@alice',
			{ id: 'https://alice.example.com/users/alice' } as IObject,
			'https://alice.example.com/users/alice',
			FetchAllowSoftFailMask.Strict,
		), 'throws if the response ID did not exactly match the expected ID');
		assert.doesNotThrow(() => assertActivityMatchesUrl(
			'https://alice.example.com/@alice',
			{ id: 'https://alice.example.com/users/alice' } as IObject,
			'https://alice.example.com/users/alice',
			FetchAllowSoftFailMask.NonCanonicalId,
		), 'does not throw if non-canonical ID is allowed');
	});

	test('origin relaxed alignment', () => {
		assert.doesNotThrow(() => assertActivityMatchesUrl(
			'https://alice.example.com/abc',
			{ id: 'https://ap.alice.example.com/abc' } as IObject,
			'https://ap.alice.example.com/abc',
			FetchAllowSoftFailMask.MisalignedOrigin | FetchAllowSoftFailMask.NonCanonicalId,
		), 'validation should pass if response is a subdomain of the expected origin');
		assert.throws(() => assertActivityMatchesUrl(
			'https://alice.multi-tenant.example.com/abc',
			{ id: 'https://alice.multi-tenant.example.com/abc' } as IObject,
			'https://bob.multi-tenant.example.com/abc',
			FetchAllowSoftFailMask.MisalignedOrigin | FetchAllowSoftFailMask.NonCanonicalId,
		), 'validation should fail if response is a disjoint domain of the expected origin');
		assert.throws(() => assertActivityMatchesUrl(
			'https://alice.example.com/abc',
			{ id: 'https://ap.alice.example.com/abc' } as IObject,
			'https://ap.alice.example.com/abc',
			FetchAllowSoftFailMask.Strict,
		), 'throws if relaxed origin is forbidden');
	});

	test('resist HTTP downgrade', () => {
		assert.throws(() => assertActivityMatchesUrl(
			'https://alice.example.com/abc',
			{ id: 'https://alice.example.com/abc' } as IObject,
			'http://alice.example.com/abc',
			FetchAllowSoftFailMask.Strict,
		), 'throws if HTTP downgrade is detected');
	});
});

function createMockResponse(opts: {
	status: number;
	statusText?: string;
	url?: string;
	headers?: Record<string, string>;
	json?: unknown;
}) {
	const normalizedHeaders = new Map<string, string>();
	for (const [key, value] of Object.entries(opts.headers ?? {})) {
		normalizedHeaders.set(key.toLowerCase(), value);
	}
	const body = Object.assign(new EventEmitter(), {
		resume: vi.fn(),
		destroy: vi.fn(),
	});
	vi.spyOn(body, 'on');
	const response = {
		status: opts.status,
		statusText: opts.statusText ?? '',
		ok: opts.status >= 200 && opts.status < 300,
		url: opts.url ?? '',
		headers: {
			get: (name: string) => normalizedHeaders.get(name.toLowerCase()) ?? null,
		},
		body,
		json: vi.fn().mockResolvedValue(opts.json ?? {}),
		text: vi.fn().mockResolvedValue(''),
	} as unknown as Response;

	return { response, body };
}

function verifyRequestSignature(
	method: string,
	calledUrl: string,
	headers: Record<string, string>,
	publicKey: string,
	expectedSignedHeaders: string[],
) {
	const sigHeader = headers['signature'];
	assert.ok(sigHeader, 'signature header must be present');
	const sigMatch = /signature="([^"]+)"/.exec(sigHeader);
	const headersMatch = /headers="([^"]+)"/.exec(sigHeader);
	assert.ok(sigMatch && headersMatch);
	const signedHeaders = headersMatch[1].split(' ');
	assert.deepStrictEqual(signedHeaders, expectedSignedHeaders);

	const u = new URL(calledUrl);
	const query = u.search || (u.href.split('#', 1)[0].endsWith('?') ? '?' : '');
	const signingString = signedHeaders.map(header => {
		if (header === '(request-target)') {
			return `(request-target): ${method.toLowerCase()} ${u.pathname}${query}`;
		}
		if (header === 'host') {
			return `host: ${u.host}`;
		}
		return `${header}: ${headers[header]}`;
	}).join('\n');

	const parsed = buildParsedSignature(signingString, sigMatch[1], 'rsa-sha256');
	assert.strictEqual(httpSignature.verifySignature(parsed, publicKey), true);
}

describe('ApRequestService redirects', () => {
	let keypair: { publicKey: string; privateKey: string };
	let sendMock: ReturnType<typeof vi.fn>;
	let service: ApRequestService;
	const user = { id: 'alice' };

	beforeAll(async () => {
		keypair = await genRsaKeyPair();
	});

	beforeEach(() => {
		sendMock = vi.fn();
		const config = { url: 'https://local.example.com' } as Config;
		const userKeypairService = {
			getUserKeypair: vi.fn().mockResolvedValue(keypair),
		} as unknown as UserKeypairService;
		const httpRequestService = {
			send: sendMock,
		} as unknown as HttpRequestService;
		const loggerService = {
			getLogger: vi.fn().mockReturnValue({
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
				debug: vi.fn(),
			}),
		} as unknown as LoggerService;
		const utilityService = {
			punyHost: vi.fn((rawUrl: string) => new URL(rawUrl).hostname),
		} as unknown as UtilityService;

		service = new ApRequestService(
			config,
			userKeypairService,
			httpRequestService,
			loggerService,
			utilityService,
		);
	});

	describe('signedPost', () => {
		test.each([301, 302, 307, 308])('follows same-origin %i keeping POST with body and re-signs', async (status) => {
			const redirectRes = createMockResponse({
				status,
				headers: { location: '/v2/inbox?delivery=1' },
			});
			const okRes = createMockResponse({ status: 202 });
			sendMock
				.mockResolvedValueOnce(redirectRes.response)
				.mockResolvedValueOnce(okRes.response);

			const payload = { type: 'Create', id: 'https://local.example.com/activities/1' };
			await service.signedPost(user, 'https://remote.example.com/inbox', payload);

			expect(sendMock).toHaveBeenCalledTimes(2);
			const [firstUrl, firstOpts] = sendMock.mock.calls[0];
			const [secondUrl, secondOpts] = sendMock.mock.calls[1];

			expect(firstUrl).toBe('https://remote.example.com/inbox');
			expect(firstOpts.method).toBe('POST');
			expect(firstOpts.body).toBe(JSON.stringify(payload));

			expect(secondUrl).toBe('https://remote.example.com/v2/inbox?delivery=1');
			expect(secondOpts.method).toBe('POST');
			expect(secondOpts.body).toBe(JSON.stringify(payload));
			expect(secondOpts.headers.signature).not.toBe(firstOpts.headers.signature);

			verifyRequestSignature('POST', firstUrl, firstOpts.headers, keypair.publicKey, ['(request-target)', 'date', 'host', 'digest']);
			verifyRequestSignature('POST', secondUrl, secondOpts.headers, keypair.publicKey, ['(request-target)', 'date', 'host', 'digest']);

			expect(redirectRes.body.on).toHaveBeenCalledWith('error', expect.any(Function));
			expect(redirectRes.body.destroy).toHaveBeenCalledTimes(1);
			expect(redirectRes.body.resume).not.toHaveBeenCalled();
			expect(okRes.body.resume).toHaveBeenCalledTimes(1);
			expect(okRes.body.destroy).not.toHaveBeenCalled();
		});

		test('switches to signed GET without body on same-origin 303', async () => {
			const redirectRes = createMockResponse({
				status: 303,
				headers: { location: 'https://remote.example.com/status/1' },
			});
			const okRes = createMockResponse({ status: 200 });
			sendMock
				.mockResolvedValueOnce(redirectRes.response)
				.mockResolvedValueOnce(okRes.response);

			await service.signedPost(user, 'https://remote.example.com/inbox', { type: 'Create' });

			expect(sendMock).toHaveBeenCalledTimes(2);
			const [secondUrl, secondOpts] = sendMock.mock.calls[1];
			expect(secondUrl).toBe('https://remote.example.com/status/1');
			expect(secondOpts.method).toBe('GET');
			expect(secondOpts.body).toBeUndefined();

			verifyRequestSignature('GET', secondUrl, secondOpts.headers, keypair.publicKey, ['(request-target)', 'date', 'host']);
			expect(redirectRes.body.destroy).toHaveBeenCalledTimes(1);
			expect(redirectRes.body.resume).not.toHaveBeenCalled();
		});

		test('allows same-host HTTP to HTTPS default-port upgrade', async () => {
			const redirectRes = createMockResponse({
				status: 308,
				headers: { location: 'https://remote.example.com/inbox' },
			});
			const okRes = createMockResponse({ status: 202 });
			sendMock
				.mockResolvedValueOnce(redirectRes.response)
				.mockResolvedValueOnce(okRes.response);

			await service.signedPost(user, 'http://remote.example.com/inbox', { type: 'Create' });

			expect(sendMock).toHaveBeenCalledTimes(2);
			const [secondUrl, secondOpts] = sendMock.mock.calls[1];
			expect(secondUrl).toBe('https://remote.example.com/inbox');
			expect(secondOpts.method).toBe('POST');
			verifyRequestSignature('POST', secondUrl, secondOpts.headers, keypair.publicKey, ['(request-target)', 'date', 'host', 'digest']);
		});

		test('rejects non-default port HTTP to HTTPS redirect', async () => {
			const redirectRes = createMockResponse({
				status: 308,
				headers: { location: 'https://remote.example.com:8443/inbox' },
			});
			sendMock.mockResolvedValueOnce(redirectRes.response);

			await expect(
				service.signedPost(user, 'http://remote.example.com/inbox', { type: 'Create' }),
			).rejects.toThrow('cross-origin redirect is not allowed for signed POST');

			expect(sendMock).toHaveBeenCalledTimes(1);
			expect(redirectRes.body.destroy).toHaveBeenCalledTimes(1);
			expect(redirectRes.body.resume).not.toHaveBeenCalled();
		});

		test.each([301, 302, 303, 307, 308])('rejects cross-origin %i without sending a second request', async (status) => {
			const redirectRes = createMockResponse({
				status,
				headers: { location: 'https://evil.example.net/inbox' },
			});
			sendMock.mockResolvedValueOnce(redirectRes.response);

			await expect(
				service.signedPost(user, 'https://remote.example.com/inbox', { type: 'Create' }),
			).rejects.toThrow('cross-origin redirect is not allowed for signed POST');

			expect(sendMock).toHaveBeenCalledTimes(1);
			expect(redirectRes.body.destroy).toHaveBeenCalledTimes(1);
			expect(redirectRes.body.resume).not.toHaveBeenCalled();
		});

		test.each([
			['data: URL', 'data:application/json,{}', 'redirect protocol is not allowed'],
			['file: URL', 'file:///etc/passwd', 'redirect protocol is not allowed'],
			['HTTPS to HTTP downgrade', 'http://remote.example.com/inbox', 'redirect protocol is not allowed'],
			['embedded credentials', 'https://user:pass@remote.example.com/inbox', 'redirect URL must not contain credentials'],
			['protocol-relative cross-origin', '//evil.example.net/inbox', 'cross-origin redirect is not allowed for signed POST'],
		])('rejects unsafe redirect target (%s) without sending a second request', async (_label, location, expectedError) => {
			const redirectRes = createMockResponse({
				status: 302,
				headers: { location },
			});
			sendMock.mockResolvedValueOnce(redirectRes.response);

			await expect(
				service.signedPost(user, 'https://remote.example.com/inbox', { type: 'Create' }),
			).rejects.toThrow(expectedError);

			expect(sendMock).toHaveBeenCalledTimes(1);
			expect(redirectRes.body.destroy).toHaveBeenCalledTimes(1);
			expect(redirectRes.body.resume).not.toHaveBeenCalled();
		});

		test.each([300, 304])('does not follow %i with Location header and throws StatusError', async (status) => {
			const res = createMockResponse({
				status,
				statusText: status === 304 ? 'Not Modified' : 'Multiple Choices',
				headers: { location: 'https://remote.example.com/other' },
			});
			sendMock.mockResolvedValueOnce(res.response);

			await expect(
				service.signedPost(user, 'https://remote.example.com/inbox', { type: 'Create' }),
			).rejects.toBeInstanceOf(StatusError);

			expect(sendMock).toHaveBeenCalledTimes(1);
			expect(res.body.destroy).toHaveBeenCalledTimes(1);
			expect(res.body.resume).not.toHaveBeenCalled();
		});

		test.each([
			['empty', ''],
			['whitespace', '   '],
		])('does not follow 302 with %s Location header and throws StatusError', async (_label, location) => {
			const res = createMockResponse({
				status: 302,
				statusText: 'Found',
				headers: { location },
			});
			sendMock.mockResolvedValueOnce(res.response);

			await expect(
				service.signedPost(user, 'https://remote.example.com/inbox', { type: 'Create' }),
			).rejects.toBeInstanceOf(StatusError);

			expect(sendMock).toHaveBeenCalledTimes(1);
			expect(res.body.destroy).toHaveBeenCalledTimes(1);
			expect(res.body.resume).not.toHaveBeenCalled();
		});

		test('destroys body immediately on non-ok error response', async () => {
			const res = createMockResponse({
				status: 500,
				statusText: 'Internal Server Error',
			});
			sendMock.mockResolvedValueOnce(res.response);

			await expect(
				service.signedPost(user, 'https://remote.example.com/inbox', { type: 'Create' }),
			).rejects.toBeInstanceOf(StatusError);

			expect(sendMock).toHaveBeenCalledTimes(1);
			expect(res.body.on).toHaveBeenCalledWith('error', expect.any(Function));
			expect(res.body.destroy).toHaveBeenCalledTimes(1);
			expect(res.body.resume).not.toHaveBeenCalled();
		});

		test('destroys 2xx response body immediately when Content-Encoding is present', async () => {
			const okRes = createMockResponse({
				status: 202,
				headers: { 'content-encoding': 'gzip' },
			});
			sendMock.mockResolvedValueOnce(okRes.response);

			await service.signedPost(user, 'https://remote.example.com/inbox', { type: 'Create' });

			expect(okRes.body.on).toHaveBeenCalledWith('error', expect.any(Function));
			expect(okRes.body.destroy).toHaveBeenCalledTimes(1);
			expect(okRes.body.resume).not.toHaveBeenCalled();
		});

		test('destroys 2xx response body when drained bytes exceed 16 KiB', async () => {
			const okRes = createMockResponse({ status: 202 });
			sendMock.mockResolvedValueOnce(okRes.response);

			await service.signedPost(user, 'https://remote.example.com/inbox', { type: 'Create' });

			expect(okRes.body.resume).toHaveBeenCalledTimes(1);
			expect(okRes.body.destroy).not.toHaveBeenCalled();

			okRes.body.emit('data', Buffer.alloc(16 * 1024));
			expect(okRes.body.destroy).not.toHaveBeenCalled();

			okRes.body.emit('data', Buffer.alloc(1));
			expect(okRes.body.destroy).toHaveBeenCalledTimes(1);

			okRes.body.emit('data', Buffer.alloc(1024));
			expect(okRes.body.destroy).toHaveBeenCalledTimes(1);
		});

		test('throws too many redirects when MAX_REDIRECTS is exceeded', async () => {
			const bodies: Array<{ destroy: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn> }> = [];
			sendMock.mockImplementation(async (requestedUrl: string) => {
				const step = sendMock.mock.calls.length;
				const { response, body } = createMockResponse({
					status: 302,
					url: requestedUrl,
					headers: { location: `/hop/${step}` },
				});
				bodies.push(body);
				return response;
			});

			await expect(
				service.signedPost(user, 'https://remote.example.com/inbox', { type: 'Create' }),
			).rejects.toThrow('too many redirects');

			expect(sendMock).toHaveBeenCalledTimes(6);
			for (const body of bodies) {
				expect(body.destroy).toHaveBeenCalledTimes(1);
				expect(body.resume).not.toHaveBeenCalled();
			}
		});
	});

	describe('signedGet', () => {
		test('follows valid cross-origin redirect and re-signs for target URL', async () => {
			const redirectRes = createMockResponse({
				status: 302,
				url: 'https://origin.example.com/@alice',
				headers: { location: 'https://target.example.net/users/alice' },
			});
			const okRes = createMockResponse({
				status: 200,
				url: 'https://target.example.net/users/alice',
				headers: { 'content-type': 'application/activity+json' },
				json: { id: 'https://target.example.net/users/alice', type: 'Person' },
			});
			sendMock
				.mockResolvedValueOnce(redirectRes.response)
				.mockResolvedValueOnce(okRes.response);

			const activity = await service.signedGet(
				'https://origin.example.com/@alice',
				user,
				FetchAllowSoftFailMask.CrossOrigin | FetchAllowSoftFailMask.NonCanonicalId,
			);

			expect(activity).toEqual({ id: 'https://target.example.net/users/alice', type: 'Person' });
			expect(sendMock).toHaveBeenCalledTimes(2);
			const [firstUrl, firstOpts] = sendMock.mock.calls[0];
			const [secondUrl, secondOpts] = sendMock.mock.calls[1];

			expect(secondUrl).toBe('https://target.example.net/users/alice');
			expect(secondOpts.headers.signature).not.toBe(firstOpts.headers.signature);
			verifyRequestSignature('GET', firstUrl, firstOpts.headers, keypair.publicKey, ['(request-target)', 'date', 'host']);
			verifyRequestSignature('GET', secondUrl, secondOpts.headers, keypair.publicKey, ['(request-target)', 'date', 'host']);
			expect(redirectRes.body.destroy).toHaveBeenCalledTimes(1);
			expect(redirectRes.body.resume).not.toHaveBeenCalled();
		});

		test.each([
			['data: URL', 'data:application/activity+json,{}', 'redirect protocol is not allowed'],
			['HTTPS to HTTP downgrade', 'http://remote.example.com/users/alice', 'redirect protocol is not allowed'],
			['embedded credentials', 'https://user:pass@remote.example.com/users/alice', 'redirect URL must not contain credentials'],
		])('rejects unsafe redirect target (%s) without sending a second request', async (_label, location, expectedError) => {
			const redirectRes = createMockResponse({
				status: 301,
				url: 'https://remote.example.com/@alice',
				headers: { location },
			});
			sendMock.mockResolvedValueOnce(redirectRes.response);

			await expect(
				service.signedGet('https://remote.example.com/@alice', user),
			).rejects.toThrow(expectedError);

			expect(sendMock).toHaveBeenCalledTimes(1);
			expect(redirectRes.body.destroy).toHaveBeenCalledTimes(1);
			expect(redirectRes.body.resume).not.toHaveBeenCalled();
		});

		test('does not follow 304 with Location header and throws StatusError', async () => {
			const res = createMockResponse({
				status: 304,
				statusText: 'Not Modified',
				url: 'https://remote.example.com/users/alice',
				headers: { location: 'https://remote.example.com/users/other' },
			});
			sendMock.mockResolvedValueOnce(res.response);

			await expect(
				service.signedGet('https://remote.example.com/users/alice', user),
			).rejects.toBeInstanceOf(StatusError);

			expect(sendMock).toHaveBeenCalledTimes(1);
			expect(res.body.destroy).toHaveBeenCalledTimes(1);
			expect(res.body.resume).not.toHaveBeenCalled();
		});

		test.each([
			['empty', ''],
			['whitespace', '   '],
		])('does not follow 302 with %s Location header and throws StatusError', async (_label, location) => {
			const res = createMockResponse({
				status: 302,
				statusText: 'Found',
				url: 'https://remote.example.com/users/alice',
				headers: { location },
			});
			sendMock.mockResolvedValueOnce(res.response);

			await expect(
				service.signedGet('https://remote.example.com/users/alice', user),
			).rejects.toBeInstanceOf(StatusError);

			expect(sendMock).toHaveBeenCalledTimes(1);
			expect(res.body.destroy).toHaveBeenCalledTimes(1);
			expect(res.body.resume).not.toHaveBeenCalled();
		});

		test('destroys body immediately on non-ok error response', async () => {
			const res = createMockResponse({
				status: 500,
				statusText: 'Internal Server Error',
				url: 'https://remote.example.com/users/alice',
			});
			sendMock.mockResolvedValueOnce(res.response);

			await expect(
				service.signedGet('https://remote.example.com/users/alice', user),
			).rejects.toBeInstanceOf(StatusError);

			expect(sendMock).toHaveBeenCalledTimes(1);
			expect(res.body.destroy).toHaveBeenCalledTimes(1);
			expect(res.body.resume).not.toHaveBeenCalled();
		});

		test('destroys body immediately when validateContentTypeSetAsActivityPub fails', async () => {
			const res = createMockResponse({
				status: 200,
				url: 'https://remote.example.com/users/alice',
				headers: { 'content-type': 'text/plain' },
			});
			sendMock.mockResolvedValueOnce(res.response);

			await expect(
				service.signedGet('https://remote.example.com/users/alice', user),
			).rejects.toThrow('Validate content type of AP response');

			expect(res.body.on).toHaveBeenCalledWith('error', expect.any(Function));
			expect(res.body.destroy).toHaveBeenCalledTimes(1);
			expect(res.body.resume).not.toHaveBeenCalled();
		});

		test('throws too many redirects when MAX_REDIRECTS is exceeded', async () => {
			const bodies: Array<{ destroy: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn> }> = [];
			sendMock.mockImplementation(async (requestedUrl: string) => {
				const step = sendMock.mock.calls.length;
				const { response, body } = createMockResponse({
					status: 302,
					url: requestedUrl,
					headers: { location: `/hop/${step}` },
				});
				bodies.push(body);
				return response;
			});

			await expect(
				service.signedGet('https://remote.example.com/users/alice', user),
			).rejects.toThrow('too many redirects');

			expect(sendMock).toHaveBeenCalledTimes(6);
			for (const body of bodies) {
				expect(body.destroy).toHaveBeenCalledTimes(1);
				expect(body.resume).not.toHaveBeenCalled();
			}
		});
	});
});
