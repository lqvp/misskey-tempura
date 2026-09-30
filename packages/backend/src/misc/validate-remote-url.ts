/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ipaddr from 'ipaddr.js';
import type { Config } from '@/config.js';

const LOCAL_HOSTNAMES = ['localhost', 'localhost.localdomain', 'metadata.google.internal'];

/**
 * Whether fetching `url` must be blocked because its host resolves to a
 * loopback / private / link-local address that is not covered by the
 * instance's allowedPrivateNetworks exception list.
 *
 * This mirrors the runtime socket guard of HttpRequestService agents
 * (which is production-gated) so user-supplied remote URLs can be
 * validated synchronously, before any fetch is issued.
 */
export function isLocalOrPrivateHost(host: string, config: Config): boolean {
	const hostname = host.toLowerCase().replace(/^\[(.*)\]$/, '$1').replace(/\.$/, '');

	if (LOCAL_HOSTNAMES.includes(hostname)) return true;
	if (hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) return true;

	let parsed: ipaddr.IPv4 | ipaddr.IPv6;
	try {
		parsed = ipaddr.parse(hostname);
	} catch {
		// not an IP literal — leave DNS-name validation to the fetch-time guard
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

/**
 * Validate a user-supplied remote URL whose content the server is about to
 * fetch (SSRF pre-check). Returns true when the request should proceed.
 */
export function validateRemoteUrl(url: string, config: Config): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
	if (parsed.username !== '' || parsed.password !== '') return false;

	return !isLocalOrPrivateHost(parsed.hostname, config);
}
