/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { IpRangeSet } from '@/misc/ip-range-set.js';
import { getIpPrefix, isPrivateOrLoopbackIp, normalizeIp } from '@/misc/ip-prefix.js';

describe('IpRangeSet', () => {
	const set = IpRangeSet.fromCidrs(['1.10.16.0/20', '# comment', '', 'garbage', '2001:db8::/32', '171.25.193.25']);

	test('skips invalid, empty and comment lines', () => {
		expect(set.size).toBe(3);
	});

	test('IPv4 CIDR boundaries', () => {
		expect(set.has('1.10.16.0')).toBe(true);
		expect(set.has('1.10.31.255')).toBe(true);
		expect(set.has('1.10.15.255')).toBe(false);
		expect(set.has('1.10.32.0')).toBe(false);
	});

	test('IPv6 CIDR', () => {
		expect(set.has('2001:db8:ffff::1')).toBe(true);
		expect(set.has('2001:db9::1')).toBe(false);
	});

	test('single IP is a host address', () => {
		expect(set.has('171.25.193.25')).toBe(true);
		expect(set.has('171.25.193.26')).toBe(false);
	});

	test('IPv4-mapped IPv6 matches IPv4 ranges', () => {
		expect(set.has('::ffff:1.10.16.5')).toBe(true);
	});

	test('unparsable input is false', () => {
		expect(set.has('not-an-ip')).toBe(false);
	});

	test('overlapping ranges are merged', () => {
		const s = IpRangeSet.fromCidrs(['10.0.0.0/8', '10.1.0.0/16', '10.2.3.4']);
		expect(s.size).toBe(1);
		expect(s.has('10.255.255.255')).toBe(true);
		expect(s.has('11.0.0.0')).toBe(false);
	});

	test('empty set', () => {
		const s = IpRangeSet.fromCidrs([]);
		expect(s.size).toBe(0);
		expect(s.has('1.2.3.4')).toBe(false);
	});
});

describe('ip-prefix', () => {
	test('normalizeIp', () => {
		expect(normalizeIp('::ffff:203.0.113.77')).toBe('203.0.113.77');
		expect(normalizeIp('203.0.113.77')).toBe('203.0.113.77');
		expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1');
		expect(normalizeIp('nope')).toBeNull();
	});

	test('getIpPrefix', () => {
		expect(getIpPrefix('203.0.113.77')).toBe('203.0.113.0/24');
		expect(getIpPrefix('::ffff:203.0.113.77')).toBe('203.0.113.0/24');
		expect(getIpPrefix('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
		expect(getIpPrefix('nope')).toBeNull();
	});

	test('isPrivateOrLoopbackIp', () => {
		expect(isPrivateOrLoopbackIp('127.0.0.1')).toBe(true);
		expect(isPrivateOrLoopbackIp('::1')).toBe(true);
		expect(isPrivateOrLoopbackIp('172.18.0.3')).toBe(true);
		expect(isPrivateOrLoopbackIp('100.64.0.1')).toBe(true);
		expect(isPrivateOrLoopbackIp('fe80::1')).toBe(true);
		expect(isPrivateOrLoopbackIp('fd00::1')).toBe(true);
		expect(isPrivateOrLoopbackIp('0.0.0.0')).toBe(true);
		expect(isPrivateOrLoopbackIp('203.0.113.5')).toBe(false);
		expect(isPrivateOrLoopbackIp('nope')).toBe(false);
	});
});
