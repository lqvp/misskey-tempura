/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { isRetryableResolveError } from '@/core/activitypub/ApInboxService.js';
import { ResolverSystemAccountError } from '@/core/activitypub/ApResolverService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { StatusError } from '@/misc/status-error.js';

describe('isRetryableResolveError', () => {
	test('treats system account lookup failures as retryable', () => {
		expect(isRetryableResolveError(new ResolverSystemAccountError(new Error('db down')))).toBe(true);
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
