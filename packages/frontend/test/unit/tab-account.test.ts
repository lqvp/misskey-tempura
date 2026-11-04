/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { describe, expect, it } from 'vitest';
import { accountUrl, selectTabAccount, sharedUrl } from '@/utility/tab-account.js';

const accounts = [['example.test', { id: 'alice' }], ['example.test', { id: 'bob' }]] as [string, { id: string }][];
describe('tab account identity', () => {
	it('selects first saved account without consulting the last shared login', () => {
		expect(selectTabAccount('https://example.test/', accounts, 'example.test')).toBe('alice');
	});
	it('prefers as over legacy loginId, including an invalid empty as', () => {
		expect(selectTabAccount('https://example.test/?as=bob&loginId=alice', accounts, 'example.test')).toBe('bob');
		expect(() => selectTabAccount('https://example.test/?as=&loginId=alice', accounts, 'example.test')).toThrow();
	});
	it('does not fall back for an unknown ID or an account from another host', () => {
		expect(() => selectTabAccount('https://example.test/?as=unknown', accounts, 'example.test')).toThrow();
		expect(() => selectTabAccount('https://example.test/?as=bob', [['elsewhere', { id: 'bob' }]], 'example.test')).toThrow();
	});
	it('keeps old notification links usable and permits a fresh signed-out client', () => {
		expect(selectTabAccount('https://example.test/?loginId=bob', accounts, 'example.test')).toBe('bob');
		expect(selectTabAccount('https://example.test/', [], 'example.test')).toBeNull();
	});
	it('carries the current ID through same-origin navigation without leaking it externally', () => {
		expect(accountUrl('/notes/123?q=test#reply', 'bob', 'https://example.test/')).toBe('https://example.test/notes/123?q=test&as=bob#reply');
		expect(accountUrl('https://elsewhere/notes/123', 'bob', 'https://example.test/')).toBe('https://elsewhere/notes/123');
	});
	it('preserves an explicit different account and replaces legacy loginId', () => {
		expect(accountUrl('/?as=alice', 'bob', 'https://example.test/')).toBe('https://example.test/?as=alice');
		expect(accountUrl('/?loginId=alice', 'bob', 'https://example.test/')).toBe('https://example.test/?as=alice');
	});
	it('removes local account selectors from a shared link but retains content query/hash', () => {
		expect(sharedUrl('/notes/123?as=bob&q=test&loginId=alice#reply', 'https://example.test/')).toBe('https://example.test/notes/123?q=test#reply');
		expect(sharedUrl('https://other.test/?as=author&loginId=reader', 'https://example.test/')).toBe('https://other.test/?as=author&loginId=reader');
	});

});
