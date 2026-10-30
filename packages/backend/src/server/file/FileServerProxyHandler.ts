/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import sharp from 'sharp';
import { sharpBmp } from '@misskey-dev/sharp-read-bmp';
import type { Config } from '@/config.js';
import { FILE_TYPE_BROWSERSAFE } from '@/const.js';
import { StatusError } from '@/misc/status-error.js';
import { contentDisposition } from '@/misc/content-disposition.js';
import { correctFilename } from '@/misc/correct-filename.js';
import { isMimeImage } from '@/misc/is-mime-image.js';
import { IImageStreamable, ImageProcessingService, webpDefault } from '@/core/ImageProcessingService.js';
import { attachStreamCleanup, needsCleanup } from './FileServerUtils.js';
import type { DownloadedFileResult, FileResolveResult, FileServerFileResolver } from './FileServerFileResolver.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

type ProxySource = DownloadedFileResult | FileResolveResult;
type CleanupableFile = ProxySource & { cleanup: () => void };
type AvailableFile = Exclude<ProxySource, { kind: 'not-found' | 'unavailable' }>;
type ProxyQuery = {
	emoji?: string;
	avatar?: string;
	static?: string;
	preview?: string;
	badge?: string;
	origin?: string;
	url?: string;
};

export class FileServerProxyHandler {
	constructor(
		private config: Config,
		private fileResolver: FileServerFileResolver,
		private assetsPath: string,
		private imageProcessingService: ImageProcessingService,
	) {}

	public async handle(request: FastifyRequest<{ Params: { url: string }; Querystring: ProxyQuery }>, reply: FastifyReply) {
		const url = 'url' in request.query ? request.query.url : 'https://' + request.params.url;

		if (typeof url !== 'string') {
			reply.code(400);
			return;
		}

		// アバタークロップなど、どうしてもオリジンである必要がある場合
		const mustOrigin = 'origin' in request.query;

		if (this.config.externalMediaProxyEnabled && !mustOrigin) {
			return await this.redirectToExternalProxy(request, reply);
		}

		this.validateUserAgent(request);

		// Range 要求 (画像変換を伴わないもの) は upstream への Range 転送を試みる。
		// 対応しない upstream や判定できない場合は従来どおり全量取得して応答する
		const rangeHeader = request.headers.range;
		const isInternalFileUrl = url.startsWith(`${this.config.url}/files/`);
		if (typeof rangeHeader === 'string' && !isInternalFileUrl && !this.hasImageConversionQuery(request.query)) {
			const partialOutcome = await this.tryServeUpstreamRange(url, rangeHeader, request, reply);
			if (partialOutcome === 'handled') return;
			if (partialOutcome !== undefined) {
				return await this.respondWithFile(partialOutcome, request, reply);
			}
		}

		// Create temp file
		const file = await this.getStreamAndTypeFromUrl(url);
		return await this.respondWithFile(file, request, reply);
	}

	/**
	 * 解決済みのファイルを応答として返す
	 */
	private async respondWithFile(
		file: ProxySource,
		request: FastifyRequest<{ Params: { url: string }; Querystring: ProxyQuery }>,
		reply: FastifyReply,
	) {
		if (file.kind === 'not-found') {
			reply.code(404);
			reply.header('Cache-Control', 'max-age=86400');
			return reply.sendFile('/dummy.png', this.assetsPath);
		}

		if (file.kind === 'unavailable') {
			reply.code(204);
			reply.header('Cache-Control', 'max-age=86400');
			return;
		}

		try {
			const image = await this.processImage(file, request, reply);

			if (needsCleanup(file)) {
				attachStreamCleanup(image.data, file.cleanup);
			}

			reply.header('Content-Type', image.type);
			reply.header('Cache-Control', 'max-age=31536000, immutable');
			reply.header('Content-Disposition',
				contentDisposition(
					'inline',
					correctFilename(file.filename, image.ext),
				),
			);
			return image.data;
		} catch (e) {
			if (needsCleanup(file)) file.cleanup();
			throw e;
		}
	}

	/** file-type の検出に必要な先頭バイト数 (4100) を取得するための probe Range */
	private static readonly RANGE_PROBE_HEADER = 'bytes=0-4099';

	/**
	 * 画像変換系のクエリが含まれるかどうかを返す
	 */
	private hasImageConversionQuery(query: ProxyQuery): boolean {
		return 'emoji' in query || 'avatar' in query || 'static' in query || 'preview' in query || 'badge' in query || 'origin' in query;
	}

	/**
	 * Range 要求を upstream へ転送し、部分取得で応答できるか試みる。
	 * シークのたびに全量を再取得するのを防ぐための経路。
	 *
	 * 戻り値:
	 * - 'handled': 部分応答を返し終えた
	 * - DownloadedFileResult: upstream が Range を無視し全体を取得済みのため、そのファイルで通常処理を続行する
	 * - undefined: 部分取得できないため、通常の全量取得フローに回す
	 *
	 * 安全上の前提:
	 * - mime は常にサーバ側で先頭の実バイトから検出し、upstream の Content-Type は信用しない
	 * - probe と本体は別リクエストのため、ETag/Last-Modified を If-Range として送り同一リソースであることを拘束する
	 *   (validator を提供しない upstream では部分配信を行わず全量取得フローに回す)
	 * - 部分応答の Content-Range と実バイト数は要求した範囲との厳密一致を検証し、合わなければ破棄する
	 * - 部分応答には X-Content-Type-Options: nosniff を付け、判定済み mime からのすり替えを無効化する
	 * - サイズ上限・タイムアウト・SSRF/リダイレクト対策は DownloadService の既存のものをそのまま使う
	 * - 範囲外・不正な Range は 416 を投げる (errorHandler が fallback を処理する)
	 */
	private async tryServeUpstreamRange(
		url: string,
		rangeHeader: string,
		request: FastifyRequest<{ Params: { url: string }; Querystring: ProxyQuery }>,
		reply: FastifyReply,
	): Promise<'handled' | DownloadedFileResult | undefined> {
		// 単一の bytes レンジのみ扱う。解釈できない指定は全量取得フロー (ローカルで 416 判定) に回す
		const rangeMatch = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
		if (rangeMatch == null || (rangeMatch[1] === '' && rangeMatch[2] === '')) return undefined;

		// 先頭部分を取得し、種別判定と総量の把握を行う
		let probe: DownloadedFileResult;
		try {
			probe = await this.fileResolver.downloadAndDetectTypeFromUrl(url, { range: FileServerProxyHandler.RANGE_PROBE_HEADER });
		} catch {
			// 取得失敗時は通常フローが同じエラーを処理する
			return undefined;
		}

		// upstream が Range を無視した場合、probe は全量取得済みのファイルになる
		if (probe.statusCode !== 206 || probe.contentRange == null) {
			if (probe.statusCode === 200) return probe;
			probe.cleanup();
			return undefined;
		}

		const probeRange = /^bytes 0-(\d+)\/(\d+)$/.exec(probe.contentRange);
		const total = probeRange != null ? parseInt(probeRange[2], 10) : NaN;
		if (!(total > 0)) {
			probe.cleanup();
			return undefined;
		}

		// 動画・音声のみ部分配信の対象にする (それ以外は全量取得フローで画像変換等を行う)
		const probeMime = probe.mime;
		const probeExt = probe.ext;
		// probe と本体は別リクエストなので、同一リソースであることを If-Range で拘束する。
		// strong validator のみ使う (weak ETag は If-Range の条件として無効、Last-Modified は
		// 解釈できる日付のみ採用する)。利用可能な validator がない upstream では部分配信を諦める
		const strongEtag = probe.etag != null && !probe.etag.startsWith('W/') ? probe.etag : undefined;
		const validLastModified = probe.lastModified != null && !Number.isNaN(Date.parse(probe.lastModified)) ? probe.lastModified : undefined;
		const ifRange = strongEtag ?? validLastModified;
		const probeFinalUrl = probe.finalUrl;
		probe.cleanup(); // 種別判定が済んだので probe は破棄する
		const isPassthroughMedia = probeMime.startsWith('video/') || probeMime.startsWith('audio/');
		if (!isPassthroughMedia || !FILE_TYPE_BROWSERSAFE.includes(probeMime) || ifRange == null) {
			return undefined;
		}

		const rejectRange = (): never => {
			if (!('fallback' in (request.query ?? {}))) {
				reply.header('Content-Range', `bytes */${total}`);
			}
			throw new StatusError('Requested Range Not Satisfiable', 416);
		};

		// 総量が分かったので、要求範囲をローカルで検証・解釈する (この時点では upstream を再取得しない)
		let start: number;
		let end: number;
		if (rangeMatch[1] === '') {
			// サフィックス Range (bytes=-N): 末尾 N バイト
			const suffixLength = parseInt(rangeMatch[2], 10);
			if (Number.isNaN(suffixLength) || suffixLength <= 0) rejectRange();
			start = Math.max(0, total - suffixLength);
			end = total - 1;
		} else {
			start = parseInt(rangeMatch[1], 10);
			end = rangeMatch[2] !== '' ? parseInt(rangeMatch[2], 10) : total - 1;
			if (Number.isNaN(start) || start < 0 || start >= total) rejectRange();
			if (Number.isNaN(end) || end >= total) end = total - 1;
			if (end < start) rejectRange();
		}

		const expectedContentRange = `bytes ${start}-${end}/${total}`;
		const partial = await this.fileResolver.downloadAndDetectTypeFromUrl(url, { range: `bytes=${start}-${end}`, ifRange });

		// upstream が Range を無視した場合は全量取得済みなので、そのファイルで通常処理に回す
		if (partial.statusCode === 200) return partial;

		// 応答が要求どおりの範囲であることを厳密に検証する。合わなければ破棄して全量取得フローに回す
		// (Content-Range の宣言と実際に取得できたバイト数に加え、リダイレクト解決後の最終URLが
		//  probe と一致することも確認する。動的なredirect先へのすり替えを受け付けない)
		if (
			partial.statusCode !== 206 ||
			partial.contentRange !== expectedContentRange ||
			partial.size !== end - start + 1 ||
			(probeFinalUrl != null && partial.finalUrl != null && partial.finalUrl !== probeFinalUrl)
		) {
			partial.cleanup();
			return undefined;
		}

		const stream = fs.createReadStream(partial.path);
		attachStreamCleanup(stream, partial.cleanup);

		reply.code(206);
		reply.header('Content-Range', expectedContentRange);
		reply.header('Accept-Ranges', 'bytes');
		reply.header('Content-Length', end - start + 1);
		reply.header('Content-Type', probeMime);
		// 判定済みの mime 以外として解釈されることを防ぐ (probe とは別応答のバイトを配信するため)
		reply.header('X-Content-Type-Options', 'nosniff');
		reply.header('Cache-Control', 'max-age=31536000, immutable');
		reply.header('Content-Disposition',
			contentDisposition(
				'inline',
				correctFilename(partial.filename, probeExt),
			),
		);
		reply.send(stream);
		return 'handled';
	}

	/**
	 * 外部メディアプロキシにリダイレクトする
	 */
	private async redirectToExternalProxy(
		request: FastifyRequest<{ Params: { url: string }; Querystring: ProxyQuery }>,
		reply: FastifyReply,
	) {
		reply.header('Cache-Control', 'public, max-age=259200'); // 3 days

		const url = new URL(`${this.config.mediaProxy}/${request.params.url || ''}`);

		for (const [key, value] of Object.entries(request.query)) {
			url.searchParams.append(key, value);
		}

		return reply.redirect(url.toString(), 301);
	}

	/**
	 * User-Agent を検証する
	 */
	private validateUserAgent(request: FastifyRequest): void {
		if (!request.headers['user-agent']) {
			throw new StatusError('User-Agent is required', 400, 'User-Agent is required');
		}
		if (request.headers['user-agent'].toLowerCase().indexOf('misskey/') !== -1) {
			throw new StatusError('Refusing to proxy a request from another proxy', 403, 'Proxy is recursive');
		}
	}

	/**
	 * 画像を処理してストリーム可能な形式に変換する
	 */
	private async processImage(
		file: AvailableFile,
		request: FastifyRequest<{ Params: { url: string }; Querystring: ProxyQuery }>,
		reply: FastifyReply,
	): Promise<IImageStreamable> {
		const query = request.query;

		const requiresImageConversion = 'emoji' in query || 'avatar' in query || 'static' in query || 'preview' in query || 'badge' in query;
		const isConvertibleImage = isMimeImage(file.mime, 'sharp-convertible-image-with-bmp');
		if (requiresImageConversion && !isConvertibleImage) {
			throw new StatusError('Unexpected mime', 404);
		}

		if ('emoji' in query || 'avatar' in query) {
			return this.processEmojiOrAvatar(file, query);
		}

		if ('static' in query) {
			return this.imageProcessingService.convertSharpToWebpStream(await sharpBmp(file.path, file.mime), 498, 422);
		}

		if ('preview' in query) {
			return this.imageProcessingService.convertSharpToWebpStream(await sharpBmp(file.path, file.mime), 200, 200);
		}

		if ('badge' in query) {
			return this.processBadge(file);
		}

		if (file.mime === 'image/svg+xml') {
			return this.imageProcessingService.convertToWebpStream(file.path, 2048, 2048);
		}

		// 動画・音声は変換できないためそのまま配信する
		// (Referer を拒否する外部 CDN のメディアを再生する経路としても使われる)
		const isPassthroughMedia = file.mime.startsWith('video/') || file.mime.startsWith('audio/');
		if ((!file.mime.startsWith('image/') && !isPassthroughMedia) || !FILE_TYPE_BROWSERSAFE.includes(file.mime)) {
			throw new StatusError('Rejected type', 403, 'Rejected type');
		}

		return this.createDefaultStream(file, request, reply);
	}

	/**
	 * 絵文字またはアバター用の画像を処理する
	 */
	private async processEmojiOrAvatar(
		file: AvailableFile,
		query: Pick<ProxyQuery, 'emoji' | 'avatar' | 'static'>,
	): Promise<IImageStreamable> {
		const isAnimationConvertibleImage = isMimeImage(file.mime, 'sharp-animation-convertible-image-with-bmp');
		if (!isAnimationConvertibleImage && !('static' in query)) {
			return {
				data: fs.createReadStream(file.path),
				ext: file.ext,
				type: file.mime,
			};
		}

		const data = (await sharpBmp(file.path, file.mime, { animated: !('static' in query) }))
			.resize({
				height: 'emoji' in query ? 128 : 320,
				withoutEnlargement: true,
			})
			.webp(webpDefault);

		return {
			data,
			ext: 'webp',
			type: 'image/webp',
		};
	}

	/**
	 * バッジ用の画像を処理する
	 */
	private async processBadge(file: AvailableFile): Promise<IImageStreamable> {
		const mask = (await sharpBmp(file.path, file.mime))
			.resize(96, 96, {
				fit: 'contain',
				position: 'centre',
				withoutEnlargement: false,
			})
			.greyscale()
			.normalise()
			.linear(1.75, -(128 * 1.75) + 128) // 1.75x contrast
			.flatten({ background: '#000' })
			.toColorspace('b-w');

		const stats = await mask.clone().stats();

		if (stats.entropy < 0.1) {
			throw new StatusError('Skip to provide badge', 404);
		}

		const data = sharp({
			create: { width: 96, height: 96, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
		})
			.pipelineColorspace('b-w')
			.boolean(await mask.png().toBuffer(), 'eor');

		return {
			data: await data.png().toBuffer(),
			ext: 'png',
			type: 'image/png',
		};
	}

	/**
	 * デフォルトのストリームを作成する（Range リクエスト対応）
	 */
	private createDefaultStream(
		file: AvailableFile,
		request: FastifyRequest,
		reply: FastifyReply,
	): IImageStreamable {
		// プロキシで取得した一時ファイル (downloaded) は size を直接保持する
		const size = 'file' in file ? file.file.size : file.size;
		if (request.headers.range && size > 0) {
			// 範囲指定を検証する。範囲外・不正な指定は 416 を返す
			// (createRangeStream は共通利用のため既存の挙動を変えず、プロキシ側で検証・解釈する)
			// 416 には現在の表現長を示す Content-Range を付ける (RFC 9110 §14.2)
			// fallback 指定時はダミー画像の応答に持ち越さないようヘッダーを付けない
			const rejectRange = (): never => {
				if (!('fallback' in ((request.query ?? {}) as Record<string, unknown>))) {
					reply.header('Content-Range', `bytes */${size}`);
				}
				throw new StatusError('Requested Range Not Satisfiable', 416);
			};
			const rangeParts = (request.headers.range as string).replace(/^bytes=/, '').split('-');
			let start: number;
			let end: number;
			if (rangeParts[0] === '') {
				// サフィックス Range (bytes=-N): 末尾 N バイト
				const suffixLength = parseInt(rangeParts[1], 10);
				if (Number.isNaN(suffixLength) || suffixLength <= 0) {
					rejectRange();
				}
				start = Math.max(0, size - suffixLength);
				end = size - 1;
			} else {
				start = parseInt(rangeParts[0], 10);
				end = rangeParts[1] ? parseInt(rangeParts[1], 10) : size - 1;
				if (Number.isNaN(start) || start < 0 || start >= size) {
					rejectRange();
				}
				if (Number.isNaN(end) || end >= size) {
					end = size - 1;
				}
				if (end < start) {
					rejectRange();
				}
			}
			const chunksize = end - start + 1;
			const stream = fs.createReadStream(file.path, { start, end });

			reply.header('Content-Range', `bytes ${start}-${end}/${size}`);
			reply.header('Accept-Ranges', 'bytes');
			reply.header('Content-Length', chunksize);
			reply.code(206);

			return {
				data: stream,
				ext: file.ext,
				type: file.mime,
			};
		}

		return {
			data: fs.createReadStream(file.path),
			ext: file.ext,
			type: file.mime,
		};
	}

	private async getStreamAndTypeFromUrl(url: string): Promise<ProxySource> {
		if (url.startsWith(`${this.config.url}/files/`)) {
			const key = url.replace(`${this.config.url}/files/`, '').split('/').shift();
			if (!key) throw new StatusError('Invalid File Key', 400, 'Invalid File Key');

			return await this.fileResolver.resolveFileByAccessKey(key);
		}

		return await this.fileResolver.downloadAndDetectTypeFromUrl(url);
	}
}
