/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ipaddr from 'ipaddr.js';
import { normalizeIp } from '@/misc/ip-prefix.js';

type Range<T> = [start: T, end: T];

function ipv4ToInt(octets: number[]): number {
	return ((octets[0] * 2 ** 24) + (octets[1] << 16) + (octets[2] << 8) + octets[3]);
}

function ipv6ToBigInt(parts: number[]): bigint {
	let v = 0n;
	for (const p of parts) v = (v << 16n) | BigInt(p);
	return v;
}

function mergeRanges<T extends number | bigint>(ranges: Range<T>[], next: (v: T) => T): Range<T>[] {
	ranges.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
	const merged: Range<T>[] = [];
	for (const r of ranges) {
		const last = merged[merged.length - 1];
		if (last && r[0] <= next(last[1])) {
			if (r[1] > last[1]) last[1] = r[1];
		} else {
			merged.push([r[0], r[1]]);
		}
	}
	return merged;
}

function contains<T extends number | bigint>(ranges: Range<T>[], v: T): boolean {
	// 開始位置が v 以下の最後の範囲を二分探索する
	let lo = 0;
	let hi = ranges.length - 1;
	let found = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1;
		if (ranges[mid][0] <= v) {
			found = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return found >= 0 && v <= ranges[found][1];
}

function parseAddr(ip: string): ipaddr.IPv4 | ipaddr.IPv6 | null {
	const normalized = normalizeIp(ip);
	return normalized ? ipaddr.parse(normalized) : null;
}

export class IpRangeSet {
	private constructor(
		private readonly v4: Range<number>[],
		private readonly v6: Range<bigint>[],
	) {}

	public static fromCidrs(cidrs: Iterable<string>): IpRangeSet {
		const v4: Range<number>[] = [];
		const v6: Range<bigint>[] = [];

		for (const raw of cidrs) {
			const line = raw.trim();
			if (line === '' || line.startsWith('#')) continue;

			try {
				const slash = line.indexOf('/');
				const addr = parseAddr(slash < 0 ? line : line.slice(0, slash));
				if (!addr) continue;

				const maxBits = addr.kind() === 'ipv4' ? 32 : 128;
				let bits = maxBits;
				if (slash >= 0) {
					const bitsStr = line.slice(slash + 1);
					if (!/^\d+$/.test(bitsStr)) continue;
					bits = parseInt(bitsStr, 10);
					// IPv4 射影の IPv6 CIDR (::ffff:a.b.c.d/96+) は IPv4 に変換されているので幅を補正する
					if (addr.kind() === 'ipv4' && line.slice(0, slash).includes(':')) {
						bits -= 96;
						if (bits < 0) continue;
					}
					if (bits > maxBits) continue;
				}

				if (addr.kind() === 'ipv4') {
					const base = ipv4ToInt((addr as ipaddr.IPv4).octets);
					const size = 2 ** (32 - bits);
					const start = Math.floor(base / size) * size;
					v4.push([start, start + size - 1]);
				} else {
					const base = ipv6ToBigInt((addr as ipaddr.IPv6).parts);
					const hostBits = BigInt(128 - bits);
					const start = (base >> hostBits) << hostBits;
					v6.push([start, start | ((1n << hostBits) - 1n)]);
				}
			} catch {
				continue;
			}
		}

		return new IpRangeSet(mergeRanges(v4, v => v + 1), mergeRanges(v6, v => v + 1n));
	}

	public has(ip: string): boolean {
		const addr = parseAddr(ip);
		if (!addr) return false;
		if (addr.kind() === 'ipv4') return contains(this.v4, ipv4ToInt((addr as ipaddr.IPv4).octets));
		return contains(this.v6, ipv6ToBigInt((addr as ipaddr.IPv6).parts));
	}

	/** マージ後の範囲数 */
	public get size(): number {
		return this.v4.length + this.v6.length;
	}
}
