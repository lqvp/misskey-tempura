/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { LookupAddress } from 'node:dns';
import ipaddr from 'ipaddr.js';
import type { Config } from '@/config.js';

const LOCAL_HOSTNAMES = ['localhost', 'localhost.localdomain', 'metadata.google.internal'];

/** Check hostnames and addresses against the instance's private-network policy. */
export function isLocalOrPrivateHost(host: string, config: Config): boolean {
	const hostname = host.toLowerCase().replace(/^\[(.*)\]$/, '$1').replace(/\.$/, '');

	if (LOCAL_HOSTNAMES.includes(hostname)) return true;
	if (hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) return true;

	let parsed: ipaddr.IPv4 | ipaddr.IPv6;
	try {
		parsed = ipaddr.parse(hostname);
	} catch {
		// DNS names are resolved by resolveRemoteUrl before a connection is opened.
		return false;
	}

	for (const net of config.allowedPrivateNetworks ?? []) {
		const cidr = ipaddr.parseCIDR(net);
		if (cidr[0].kind() === parsed.kind() && parsed.match(ipaddr.parseCIDR(net))) {
			return false;
		}
	}

	return parsed.range() !== 'unicast';
}

/** Resolve and validate all addresses before selecting the connection target. */
export async function resolveRemoteUrl(url: string, config: Config): Promise<LookupAddress | null> {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
		if (parsed.username !== '' || parsed.password !== '') return null;
		if (isLocalOrPrivateHost(parsed.hostname, config)) return null;

		const hostname = parsed.hostname.replace(/^\[(.*)\]$/, '$1');
		const family = isIP(hostname);
		let timer: ReturnType<typeof setTimeout> | undefined;
		let addresses: LookupAddress[];
		try {
			addresses = family ? [{ address: hostname, family }] : await Promise.race([
				lookup(hostname, { all: true }),
				new Promise<never>((_resolve, reject) => {
					timer = setTimeout(() => reject(new Error('DNS lookup timed out')), 30_000);
				}),
			]);
		} finally {
			clearTimeout(timer);
		}
		if (addresses.length === 0 || addresses.some(({ address }) => isLocalOrPrivateHost(address, config))) return null;
		return addresses[0];
	} catch {
		return null;
	}
}

/** Pre-check only: downloads must also pin their connection to a validated address. */
export async function validateRemoteUrl(url: string, config: Config): Promise<boolean> {
	return await resolveRemoteUrl(url, config) !== null;
}
