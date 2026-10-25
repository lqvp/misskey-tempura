/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { assertValidOidcIssuerUrl } from '@/misc/sso-issuer-url.js';

describe('assertValidOidcIssuerUrl', () => {
	test.each([
		'https://idp.example.com',
		'https://idp.example.com/application/o/misskey/',
		'  https://idp.example.com:8443/realms/main  ',
	])('accepts %s', url => {
		expect(() => assertValidOidcIssuerUrl(url)).not.toThrow();
	});

	test.each([
		'not-a-url',
		'idp.example.com',
		'/relative/path',
		'',
	])('rejects unparsable %j', url => {
		expect(() => assertValidOidcIssuerUrl(url)).toThrow('valid URL');
	});

	test.each([
		'http://idp.example.com',
		'javascript:alert(1)',
		'ftp://idp.example.com',
		'file:///etc/passwd',
	])('rejects non-https scheme %s', url => {
		expect(() => assertValidOidcIssuerUrl(url)).toThrow('https');
	});

	test.each([
		'https://idp.example.com?x=1',
		'https://idp.example.com#x',
		'https://idp.example.com/realms/main?',
		'https://idp.example.com/realms/main#',
	])('rejects query or fragment %s', url => {
		expect(() => assertValidOidcIssuerUrl(url)).toThrow('query or fragment');
	});

	test('rejects embedded credentials', () => {
		expect(() => assertValidOidcIssuerUrl('https://user:pass@idp.example.com')).toThrow('credentials');
	});
});
