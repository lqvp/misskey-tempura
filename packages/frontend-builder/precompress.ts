/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import * as zlib from 'node:zlib';

const brotliCompress = promisify(zlib.brotliCompress);

const compressibleExtensions = new Set(['.js', '.mjs', '.css', '.json', '.svg']);
const minSize = 1024;

/**
 * outputDir 配下の圧縮可能なファイルを brotli で事前圧縮し、隣に `.br` を置く。
 * バックエンドは @fastify/static の preCompressed でこれを配信する。
 */
export async function precompressDir(outputDir: string, quality = zlib.constants.BROTLI_MAX_QUALITY): Promise<void> {
	const entries = await fs.readdir(outputDir, { recursive: true, withFileTypes: true });
	const files = entries
		.filter(entry => entry.isFile() && compressibleExtensions.has(path.extname(entry.name)))
		.map(entry => path.join(entry.parentPath, entry.name));

	await Promise.all(files.map(async file => {
		const source = await fs.readFile(file);
		if (source.length < minSize) return;
		const compressed = await brotliCompress(source, {
			params: {
				[zlib.constants.BROTLI_PARAM_QUALITY]: quality,
				[zlib.constants.BROTLI_PARAM_SIZE_HINT]: source.length,
			},
		});
		if (compressed.length >= source.length) return;
		await fs.writeFile(`${file}.br`, compressed);
	}));
}
