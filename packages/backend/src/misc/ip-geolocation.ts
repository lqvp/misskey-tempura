/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';

const CACHE_TTL_SEC = 60 * 60; // 1 hour
const CACHE_TTL_MS = CACHE_TTL_SEC * 1000;

interface CacheEntry {
	ts: number;
	country: string;
}

const cache = new Map<string, CacheEntry>();

export async function getIpCountry(ip: string, redis?: Redis.Redis): Promise<string | null> {
	if (!ip) return null;

	// Redis cache first
	if (redis) {
		const cached = await redis.get(`ipgeo:${ip}`);
		if (cached) {
			// Also cache in memory for faster subsequent access
			cache.set(ip, { ts: Date.now(), country: cached });
			return cached;
		}
	}

	// In-memory cache fallback
	const entry = cache.get(ip);
	if (entry && (Date.now() - entry.ts) < CACHE_TTL_MS) {
		return entry.country;
	}

	try {
		// Request only the fields we need to minimise bandwidth
		const url = `http://ip-api.com/json/${ip}?fields=status,country`;
		const res = await fetch(url);
		const data = await res.json();
		if (data?.status === 'success' && typeof data.country === 'string') {
			const country: string = data.country;

			// Cache in memory
			cache.set(ip, { ts: Date.now(), country });

			// Cache in Redis with TTL
			if (redis) {
				await redis.setex(`ipgeo:${ip}`, CACHE_TTL_SEC, country);
			}

			return country;
		}
	} catch {
		// Ignore errors – just return null so the caller can continue without location.
	}

	return null;
}

