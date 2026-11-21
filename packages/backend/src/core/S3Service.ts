/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL } from 'node:url';
import * as http from 'node:http';
import * as https from 'node:https';
import { Injectable } from '@nestjs/common';
import type { MiMeta } from '@/models/Meta.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { bindThis } from '@/decorators.js';
import type { DeleteObjectCommandInput, ListObjectsCommandInput, PutObjectCommandInput, S3Client } from '@aws-sdk/client-s3';
import type { NodeHttpHandlerOptions } from '@smithy/node-http-handler';

@Injectable()
export class S3Service {
	constructor(
		private httpRequestService: HttpRequestService,
	) {
	}

	@bindThis
	private async getS3Client(meta: MiMeta): Promise<S3Client> {
		const [{ S3Client }, { NodeHttpHandler }] = await Promise.all([
			import('@aws-sdk/client-s3'),
			import('@smithy/node-http-handler'),
		]);
		const u = meta.objectStorageEndpoint
			? `${meta.objectStorageUseSSL ? 'https' : 'http'}://${meta.objectStorageEndpoint}`
			: `${meta.objectStorageUseSSL ? 'https' : 'http'}://example.net`; // dummy url to select http(s) agent

		const agent = this.httpRequestService.getAgentByUrl(new URL(u), !meta.objectStorageUseProxy, true);
		const handlerOption: NodeHttpHandlerOptions = {
			// オブジェクトストレージが不応答の場合にアップロード/削除/一覧が無期限に待機しないようにタイムアウトを設定する
			requestTimeout: 300_000, // 5 分 (大きなパートの転送を考慮)
			throwOnRequestTimeout: true, // 期限内に応答しなければ要求を破棄してエラーにする
			connectionTimeout: 10_000, // 10 秒
			socketTimeout: 120_000, // 2 分 (応答ボディの停滞防止)
			// requestTimeout はヘッダ到着までの一括上限、socketTimeout はボディ読み出し中のソケット停滞上限
		};
		if (meta.objectStorageUseSSL) {
			handlerOption.httpsAgent = agent as https.Agent;
		} else {
			handlerOption.httpAgent = agent as http.Agent;
		}

		return new S3Client({
			endpoint: meta.objectStorageEndpoint ? u : undefined,
			credentials: (meta.objectStorageAccessKey !== null && meta.objectStorageSecretKey !== null) ? {
				accessKeyId: meta.objectStorageAccessKey,
				secretAccessKey: meta.objectStorageSecretKey,
			} : undefined,
			region: meta.objectStorageRegion ? meta.objectStorageRegion : undefined, // 空文字列もundefinedにするため ?? は使わない
			tls: meta.objectStorageUseSSL,
			forcePathStyle: meta.objectStorageEndpoint ? meta.objectStorageS3ForcePathStyle : false, // AWS with endPoint omitted
			requestHandler: new NodeHttpHandler(handlerOption),
			requestChecksumCalculation: 'WHEN_REQUIRED',
			responseChecksumValidation: 'WHEN_REQUIRED',
		});
	}

	@bindThis
	public async upload(meta: MiMeta, input: PutObjectCommandInput) {
		const [client, { Upload }] = await Promise.all([
			this.getS3Client(meta),
			import('@aws-sdk/lib-storage'),
		]);
		return new Upload({
			client,
			params: input,
			partSize: (client.config.endpoint && (await client.config.endpoint()).hostname === 'storage.googleapis.com')
				? 500 * 1024 * 1024
				: 8 * 1024 * 1024,
		}).done();
	}

	@bindThis
	public async delete(meta: MiMeta, input: DeleteObjectCommandInput) {
		const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
		const client = await this.getS3Client(meta);
		return client.send(new DeleteObjectCommand(input));
	}

	@bindThis
	public async list(meta: MiMeta, input: ListObjectsCommandInput) {
		const { ListObjectsCommand } = await import('@aws-sdk/client-s3');
		const client = await this.getS3Client(meta);
		return client.send(new ListObjectsCommand(input));
	}
}
