/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readdir } from 'node:fs/promises';
import { posix, join, relative, sep } from 'node:path';
import fastifyStatic from '@fastify/static';
import vary from 'vary';
import type { FastifyInstance } from 'fastify';

interface AssetRoot {
	root: string;
	prefix: string;
}

/**
 * Build output is immutable for the lifetime of the server. Index compressed
 * siblings once, then leave all file handling and URL validation to static.
 */
export async function registerPrecompressedAssets(fastify: FastifyInstance, roots: AssetRoot[]): Promise<void> {
	const compressedPaths = new Set<string>();
	const fallbackPrefixes = new Set<string>();

	for (const { root, prefix } of roots) {
		try {
			const entries = await readdir(root, { recursive: true, withFileTypes: true });
			for (const entry of entries) {
				// Recursive readdir does not follow symlinked directories. Keep
				// filesystem negotiation rather than trust a partial inventory.
				if (entry.isSymbolicLink()) {
					fallbackPrefixes.add(prefix);
					break;
				}
				if (!entry.isFile() || !/\.(?:br|gz|deflate)$/.test(entry.name)) continue;
				const file = relative(root, join(entry.parentPath, entry.name)).split(sep).join('/');
				const logicalPath = prefix + file.replace(/\.(?:br|gz|deflate)$/, '');
				compressedPaths.add(logicalPath);
				if (logicalPath.endsWith('/index.html')) {
					const directory = posix.dirname(logicalPath);
					compressedPaths.add(directory);
					compressedPaths.add(directory + '/');
				}
			}
		} catch (error) {
			// An incomplete inventory must never silently disable compression.
			fallbackPrefixes.add(prefix);
			fastify.log.warn({ err: error, root }, 'Could not index precompressed assets; keeping filesystem negotiation');
		}
	}

	fastify.addConstraintStrategy({
		name: 'assetCompression',
		mustMatchWhenDerived: false,
		storage: () => new Map(),
		deriveConstraint(request) {
			const url = request.url ?? '';
			// Most requests are not asset requests. Do not parse their URLs.
			if (!roots.some(({ prefix }) => url.startsWith(prefix))) return 'compressed';
			const queryStart = url.indexOf('?');
			const pathname = queryStart === -1 ? url : url.slice(0, queryStart);
			// Keep static's own decoding and validation for every encoded URL,
			// including encoded separators, literal percent signs and bad escapes.
			if (pathname.includes('%')) return 'compressed';
			if (roots.some(({ prefix }) => fallbackPrefixes.has(prefix) && pathname.startsWith(prefix))) return 'compressed';
			return compressedPaths.has(pathname) ? 'compressed' : 'plain';
		},
	});

	for (const { root, prefix } of roots) {
		for (const preCompressed of [false, true]) {
			fastify.register(fastifyStatic, {
				root,
				prefix,
				maxAge: 30 * 24 * 60 * 60 * 1000,
				immutable: true,
				preCompressed,
				decorateReply: false,
				setHeaders(reply) {
					const current = reply.getHeader('Vary');
					reply.header('Vary', vary.append(Array.isArray(current) ? current.join(', ') : String(current ?? ''), 'Accept-Encoding'));
				},
				constraints: { assetCompression: preCompressed ? 'compressed' : 'plain' },
			});
		}
	}
}
