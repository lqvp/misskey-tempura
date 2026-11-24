/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import * as Stream from 'node:stream';
import { FILE_TYPE_BROWSERSAFE } from '@/const.js';
import { contentDisposition } from '@/misc/content-disposition.js';
import type { IImageStreamable } from '@/core/ImageProcessingService.js';
import type { FastifyReply } from 'fastify';

export type RangeStream = {
	stream: fs.ReadStream;
	start: number;
	end: number;
	chunksize: number;
};

/**
 * Range リクエストに対応したストリームを作成する
 */
export function createRangeStream(rangeHeader: string, size: number, path: string): RangeStream | null {
	// 複数範囲には対応しないため、最初の範囲のみを使用する
	const range = rangeHeader.replace(/^bytes=/, '').split(',')[0]?.trim();
	if (range === undefined) return null;

	const match = range.match(/^(\d*)-(\d*)$/);
	if (match === null || (match[1] === '' && match[2] === '')) return null;

	let start: number;
	let end: number;
	if (match[1] === '') {
		// suffix 形式 bytes=-N (末尾Nバイト)
		const suffixLength = Number(match[2]);
		if (suffixLength === 0) return null;
		start = Math.max(0, size - suffixLength);
		end = size - 1;
	} else {
		start = Number(match[1]);
		end = match[2] === '' ? size - 1 : Number(match[2]);
		// ファイルサイズを超える終端は size-1 に丸める
		if (end > size - 1) {
			end = size - 1;
		}
	}

	// 検証: 有限な数値であり、有効な範囲であること
	if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
	if (start < 0 || start >= size || end < start) return null;

	const chunksize = end - start + 1;

	return {
		stream: fs.createReadStream(path, { start, end }),
		start,
		end,
		chunksize,
	};
}

/**
 * ストリームにcleanupハンドラを設定する
 * ストリームでない場合は即座にcleanupを実行する
 */
export function attachStreamCleanup(data: IImageStreamable['data'], cleanup: () => void): void {
	if ('pipe' in data && typeof data.pipe === 'function') {
		data.on('end', cleanup);
		data.on('close', cleanup);
	} else {
		cleanup();
	}
}

/**
 * MIME タイプがブラウザセーフかどうかに応じて Content-Type を返す
 */
export function getSafeContentType(mime: string): string {
	return FILE_TYPE_BROWSERSAFE.includes(mime) ? mime : 'application/octet-stream';
}

/**
 * Range リクエストを処理してストリームを返す
 * Range ヘッダーがない場合は通常のストリームを返す
 * Accept-Ranges / Content-Length ヘッダーもここで設定する
 */
export function handleRangeRequest(
	reply: FastifyReply,
	rangeHeader: string | undefined,
	size: number,
	path: string,
): Stream.Readable {
	reply.header('Accept-Ranges', 'bytes');
	if (rangeHeader && size > 0) {
		const rangeStream = createRangeStream(rangeHeader, size, path);
		// 不正な Range ヘッダーの場合は 416 を返す
		if (rangeStream === null) {
			reply.header('Content-Range', `bytes */${size}`);
			reply.code(416);
			return Stream.Readable.from([]);
		}
		const { stream, start, end, chunksize } = rangeStream;
		reply.header('Content-Range', `bytes ${start}-${end}/${size}`);
		reply.header('Content-Length', chunksize);
		reply.code(206);
		return stream;
	}
	reply.header('Content-Length', size);
	return fs.createReadStream(path);
}

export type FileResponseOptions = {
	mime: string;
	filename: string;
	cacheControl?: string;
};

/**
 * ファイルレスポンス用の共通ヘッダーを設定する
 */
export function setFileResponseHeaders(
	reply: FastifyReply,
	options: FileResponseOptions,
): void {
	reply.header('Content-Type', getSafeContentType(options.mime));
	reply.header('Cache-Control', options.cacheControl ?? 'max-age=31536000, immutable');
	reply.header('Content-Disposition', contentDisposition('inline', options.filename));
}

/**
 * cleanup が必要なファイルかどうかを判定する型ガード
 */
export function needsCleanup<T extends { kind?: string; cleanup?: () => void }>(file: T): file is T & { cleanup: () => void } {
	return 'cleanup' in file && typeof file.cleanup === 'function';
}
