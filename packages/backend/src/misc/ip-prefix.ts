/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ipaddr from 'ipaddr.js';

const PRIVATE_RANGES = new Set(['private', 'loopback', 'uniqueLocal', 'linkLocal', 'unspecified', 'carrierGradeNat']);

function parse(ip: string): ipaddr.IPv4 | ipaddr.IPv6 | null {
	if (!ipaddr.isValid(ip)) return null;
	const addr = ipaddr.parse(ip);
	if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
		return (addr as ipaddr.IPv6).toIPv4Address();
	}
	return addr;
}

/** IPv4 射影の IPv6 は IPv4 に戻す。パースできなければ null */
export function normalizeIp(ip: string): string | null {
	const addr = parse(ip);
	return addr ? addr.toString() : null;
}

/** IPv4 は a.b.c.0/24、IPv6 は xxxx:xxxx:xxxx:xxxx::/64 */
export function getIpPrefix(ip: string): string | null {
	const addr = parse(ip);
	if (!addr) return null;
	if (addr.kind() === 'ipv4') {
		const o = (addr as ipaddr.IPv4).octets;
		return `${o[0]}.${o[1]}.${o[2]}.0/24`;
	}
	const p = (addr as ipaddr.IPv6).parts;
	return `${p.slice(0, 4).map(x => x.toString(16)).join(':')}::/64`;
}

export function isPrivateOrLoopbackIp(ip: string): boolean {
	const addr = parse(ip);
	if (!addr) return false;
	return PRIVATE_RANGES.has(addr.range());
}
