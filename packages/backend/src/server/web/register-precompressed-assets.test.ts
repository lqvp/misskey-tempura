/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import fs from 'node:fs';
import { mkdtemp, mkdir, readdir, rm, writeFile, unlink, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync, deflateSync } from 'node:zlib';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { registerPrecompressedAssets } from './register-precompressed-assets.js';

vi.mock('node:fs/promises', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs/promises')>();
	return { ...actual, readdir: vi.fn(actual.readdir) };
});

const source = 'const hello = "hello world";\n'.repeat(100);
let directory: string;
let apps: ReturnType<typeof Fastify>[];

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'precompressed-assets-'));
	apps = [];
	for (const root of ['main', 'embed']) {
		const path = join(directory, root);
		await mkdir(join(path, 'nested'), { recursive: true });
		for (const name of ['large.js', 'small.js', 'image.png', 'hash#question?.js', 'nested/index.html']) {
			await writeFile(join(path, name), name === 'small.js' ? 'small' : source);
		}
		for (const name of ['large.js', 'hash#question?.js', 'nested/index.html']) {
			await writeFile(join(path, name + '.br'), brotliCompressSync(source));
		}
		await writeFile(join(path, 'gzip.js.gz'), gzipSync(source));
		await writeFile(join(path, 'deflate.js.deflate'), deflateSync(source));
	}
});

afterEach(async () => {
	await Promise.all(apps.map(app => app.close()));
	await rm(directory, { recursive: true, force: true });
	vi.restoreAllMocks();
});

async function createApp(optimized = true) {
	const app = Fastify();
	apps.push(app);
	const roots = [
		{ root: join(directory, 'main'), prefix: '/vite/' },
		{ root: join(directory, 'embed'), prefix: '/embed_vite/' },
	];
	app.addHook('onRequest', (_request, reply, done) => {
		reply.header('Vary', 'Origin');
		done();
	});
	if (optimized) {
		await registerPrecompressedAssets(app, roots);
	} else {
		for (const options of roots) {
			app.register(fastifyStatic, { ...options, maxAge: 30 * 24 * 60 * 60 * 1000, immutable: true, preCompressed: true, decorateReply: false });
		}
	}
	app.get('/api/example', () => 'unrelated');
	await app.ready();
	return app;
}

function relevantHeaders(headers: Record<string, unknown>) {
	return Object.fromEntries(['content-type', 'content-encoding', 'cache-control', 'etag', 'last-modified', 'accept-ranges', 'content-range', 'content-length'].map(key => [key, headers[key]]));
}

describe('precompressed asset routing', () => {
	test('matches static responses for both prefixes, encodings, URL spellings and methods', async () => {
		const baseline = await createApp(false);
		const optimized = await createApp();
		for (const prefix of ['/vite/', '/embed_vite/']) {
			for (const path of ['large.js', 'small.js', 'image.png', 'missing.js', 'nested', 'nested/', 'nested/index.html', 'gzip.js', 'deflate.js', 'large.js?version=1', '%6carge.js', 'hash%23question%3F.js', 'nested%2Findex.html', '../small.js', 'nested/../large.js', 'nested//index.html', '%ZZ.js']) {
				for (const encoding of ['br', 'br, gzip, deflate', 'br;q=0, gzip', 'identity']) {
					for (const method of ['GET', 'HEAD'] as const) {
						const request = { method, url: prefix + path, headers: { 'accept-encoding': encoding } };
						const expected = await baseline.inject(request);
						const actual = await optimized.inject(request);
						expect(actual.statusCode, JSON.stringify(request)).toBe(expected.statusCode);
						expect(actual.rawPayload).toEqual(expected.rawPayload);
						expect(relevantHeaders(actual.headers)).toEqual(relevantHeaders(expected.headers));
						if (actual.statusCode === 200) {
							expect(String(actual.headers.vary).toLowerCase().split(/,\s*/).sort()).toEqual(['accept-encoding', 'origin']);
						}
					}
				}
			}
		}
	});

	test('does not probe compressed siblings for assets without sidecars', async () => {
		const baseline = await createApp(false);
		const optimized = await createApp();
		// send uses callback-based fs.stat. Spy on the real calls, without
		// replacing filesystem results or bypassing the static plugin.
		const stat = vi.spyOn(fs, 'stat');
		for (const [prefix, root] of [['/vite/', 'main'], ['/embed_vite/', 'embed']]) {
			for (const file of ['small.js', 'image.png']) {
				const original = join(directory, root, file);
				const siblings = ['.br', '.gz', '.deflate'].map(extension => original + extension);
				for (const method of ['GET', 'HEAD'] as const) {
					const request = { method, url: prefix + file + '?version=1', headers: { 'accept-encoding': 'br, gzip, deflate' } };
					stat.mockClear();
					const expected = await baseline.inject(request);
					expect(expected.statusCode).toBe(200);
					const baselinePaths = stat.mock.calls.map(([path]) => String(path));
					// Positive control: this observer must see all three missing
					// candidate probes when the original static handler is used.
					for (const sibling of siblings) expect(baselinePaths).toContain(sibling);
					stat.mockClear();
					const actual = await optimized.inject(request);
					expect(actual.statusCode).toBe(200);
					expect(actual.rawPayload).toEqual(expected.rawPayload);
					const optimizedPaths = stat.mock.calls.map(([path]) => String(path));
					expect(optimizedPaths).toContain(original);
					for (const sibling of siblings) expect(optimizedPaths).not.toContain(sibling);
				}
			}
			stat.mockClear();
			const response = await optimized.inject({ url: prefix + 'large.js', headers: { 'accept-encoding': 'br' } });
			expect(response.headers['content-encoding']).toBe('br');
			expect(stat.mock.calls.map(([path]) => String(path))).toContain(join(directory, root, 'large.js.br'));
		}
	});

	test('keeps conditional and range responses, and does not affect other routes', async () => {
		const baseline = await createApp(false);
		const optimized = await createApp();
		for (const path of ['large.js', 'small.js']) {
			const initial = await baseline.inject({ url: '/vite/' + path, headers: { 'accept-encoding': 'br' } });
			for (const headers of [{ 'if-none-match': initial.headers.etag }, { range: 'bytes=0-3' }]) {
				const request = { url: '/vite/' + path, headers: { ...headers, 'accept-encoding': 'br' } };
				const expected = await baseline.inject(request);
				const actual = await optimized.inject(request);
				expect(actual.statusCode).toBe(expected.statusCode);
				expect(actual.rawPayload).toEqual(expected.rawPayload);
				expect(relevantHeaders(actual.headers)).toEqual(relevantHeaders(expected.headers));
				expect(String(actual.headers.vary).toLowerCase().split(/,\s*/).sort()).toEqual(['accept-encoding', 'origin']);
			}
		}
		expect((await optimized.inject('/api/example')).body).toBe('unrelated');
		expect((await optimized.inject('/not-found')).statusCode).toBe(404);
	});

	test('falls back to the original file when a sidecar disappears after startup', async () => {
		const app = await createApp();
		await unlink(join(directory, 'main/large.js.br'));
		const response = await app.inject({ url: '/vite/large.js', headers: { 'accept-encoding': 'br, gzip, deflate' } });
		expect(response.statusCode).toBe(200);
		expect(response.headers['content-encoding']).toBeUndefined();
		expect(response.body).toBe(source);
	});

	test('keeps filesystem negotiation if inventory cannot be read', async () => {
		vi.mocked(readdir).mockRejectedValueOnce(new Error('inventory unavailable'));
		const app = await createApp();
		const response = await app.inject({ url: '/vite/large.js', headers: { 'accept-encoding': 'br' } });
		expect(response.statusCode).toBe(200);
		expect(response.headers['content-encoding']).toBe('br');
		const embed = await app.inject({ url: '/embed_vite/large.js', headers: { 'accept-encoding': 'br' } });
		expect(embed.statusCode).toBe(200);
		expect(embed.headers['content-encoding']).toBe('br');
	});

	test('keeps filesystem negotiation for a root containing symlinks', async () => {
		await symlink(join(directory, 'main/large.js.br'), join(directory, 'main/small.js.br'));
		const app = await createApp();
		const response = await app.inject({ url: '/vite/small.js', headers: { 'accept-encoding': 'br' } });
		expect(response.statusCode).toBe(200);
		expect(response.headers['content-encoding']).toBe('br');
	});
});
