/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { EntityNotFoundError } from 'typeorm';
import { FetchError, Response } from 'node-fetch';
import { isRetryableResolveError } from '@/core/activitypub/ApInboxService.js';
import { ResolverSystemAccountError } from '@/core/activitypub/ApResolverService.js';
import { ApValidationError, validateContentTypeSetAsActivityPub } from '@/core/activitypub/misc/validator.js';
import { assertActivityMatchesUrl, FetchAllowSoftFailMask } from '@/core/activitypub/misc/check-against-url.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { StatusError } from '@/misc/status-error.js';

describe('isRetryableResolveError', () => {
	test('treats system account lookup failures as retryable', () => {
		expect(isRetryableResolveError(new ResolverSystemAccountError(new Error('db down')))).toBe(true);
	});

	test('treats AP response validation errors as non-retryable', () => {
		expect(isRetryableResolveError(new ApValidationError('invalid content-type'))).toBe(false);

		let contentTypeErr: unknown;
		try {
			validateContentTypeSetAsActivityPub(new Response('<html></html>', { headers: { 'content-type': 'text/html' } }));
		} catch (e) {
			contentTypeErr = e;
		}
		expect(contentTypeErr).toBeInstanceOf(ApValidationError);
		expect(isRetryableResolveError(contentTypeErr)).toBe(false);

		let missingIdErr: unknown;
		try {
			assertActivityMatchesUrl('https://remote.example/activities/1', { type: 'Create' }, 'https://remote.example/activities/1', FetchAllowSoftFailMask.Strict);
		} catch (e) {
			missingIdErr = e;
		}
		expect(missingIdErr).toBeInstanceOf(ApValidationError);
		expect(isRetryableResolveError(missingIdErr)).toBe(false);
	});

	test('treats EntityNotFoundError, SyntaxError, and ERR_INVALID_URL as non-retryable', () => {
		expect(isRetryableResolveError(new EntityNotFoundError('Note', { id: 'missing' }))).toBe(false);
		expect(isRetryableResolveError(new SyntaxError('Unexpected token'))).toBe(false);

		let invalidUrlErr: unknown;
		try {
			// eslint-disable-next-line no-new
			new URL('not-a-valid-url');
		} catch (e) {
			invalidUrlErr = e;
		}
		expect(isRetryableResolveError(invalidUrlErr)).toBe(false);
	});

	test('treats permanent IdentifiableErrors as non-retryable', () => {
		// Instance is blocked
		expect(isRetryableResolveError(new IdentifiableError('09d79f9e-64f1-4316-9cfa-e75c4d091574', 'Instance is blocked'))).toBe(false);
		// invalid response
		expect(isRetryableResolveError(new IdentifiableError('72180409-793c-4973-868e-5a118eb5519b', 'invalid response'))).toBe(false);
		// recursion limit
		expect(isRetryableResolveError(new IdentifiableError('d592da9f-822f-4d91-83d7-4ceefabcf3d2', 'hit recursion limit'))).toBe(false);
	});

	test('treats unknown IdentifiableErrors (e.g. internal DB failures) as retryable', () => {
		expect(isRetryableResolveError(new IdentifiableError('00000000-0000-4000-8000-000000000000', 'unexpected'))).toBe(true);
	});

	test('classifies StatusError by its retryable flag', () => {
		expect(isRetryableResolveError(new StatusError('server error', 500))).toBe(true);
		expect(isRetryableResolveError(new StatusError('rate limited', 429))).toBe(true);
		expect(isRetryableResolveError(new StatusError('not found', 404))).toBe(false);
		expect(isRetryableResolveError(new StatusError('bad request', 400))).toBe(false);
	});

	test('classifies FetchError by error type and blocked address', () => {
		expect(isRetryableResolveError(new FetchError('network error', 'system'))).toBe(true);
		expect(isRetryableResolveError(new FetchError('request failed, reason: Blocked address: 127.0.0.1', 'system'))).toBe(false);
		expect(isRetryableResolveError(new FetchError('content size over limit', 'max-size'))).toBe(false);
		expect(isRetryableResolveError(new FetchError('invalid json', 'invalid-json'))).toBe(false);
	});

	test('treats aborts as retryable', () => {
		const aborted = new Error('aborted');
		aborted.name = 'AbortError';
		expect(isRetryableResolveError(aborted)).toBe(true);
	});

	test('treats unexpected errors (e.g. DB outage) as retryable', () => {
		expect(isRetryableResolveError(new Error('connection terminated unexpectedly'))).toBe(true);
		const queryFailed = new Error('QueryFailedError: connection refused');
		queryFailed.name = 'QueryFailedError';
		expect(isRetryableResolveError(queryFailed)).toBe(true);
	});
});
