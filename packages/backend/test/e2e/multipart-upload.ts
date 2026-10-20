/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { beforeAll, describe, test } from 'vitest';
import { api, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

const MB = 1024 * 1024;

// 既定のポリシー: ドライブ容量 100MB、1 ファイル 30MB
describe('Multipart upload reservations', () => {
	let user: misskey.entities.SignupResponse;

	beforeAll(async () => {
		user = await signup({ username: 'multipartuser' });
	}, 1000 * 60 * 2);

	const create = (totalSize: number, totalParts = 1) =>
		api('drive/files/create-multipart-upload', { totalSize, totalParts }, user);

	test('未完了のアップロードの宣言サイズも容量として予約し、中断すると解放する', async () => {
		const first = await create(30 * MB);
		assert.strictEqual(first.status, 200);
		assert.strictEqual((await create(30 * MB)).status, 200);
		assert.strictEqual((await create(30 * MB)).status, 200);

		// 90MB 予約済みなので、さらに 30MB は入らない
		const full = await create(30 * MB);
		assert.strictEqual(full.status, 400);
		assert.strictEqual((full.body as any).error.code, 'NO_FREE_SPACE');

		const abort = await api('drive/files/abort-multipart-upload', { id: (first.body as any).id }, user);
		assert.strictEqual(abort.status, 204);

		assert.strictEqual((await create(30 * MB)).status, 200);
	});

	test('1 ファイルの上限を超える宣言は作る前に断る', async () => {
		const res = await create(31 * MB);
		assert.strictEqual(res.status, 400);
		assert.strictEqual((res.body as any).error.code, 'MAX_FILE_SIZE_EXCEEDED');
	});

	test('パート数が合計バイト数を超える宣言は断る', async () => {
		const res = await create(10, 11);
		assert.strictEqual(res.status, 400);
		assert.strictEqual((res.body as any).error.code, 'TOO_MANY_PARTS');
	});

	test('他人や存在しないアップロードは中断できない', async () => {
		const other = await signup({ username: 'multipartother' });
		const mine = await create(1);
		const res = await api('drive/files/abort-multipart-upload', { id: (mine.body as any).id }, other);
		assert.strictEqual(res.status, 400);
		assert.strictEqual((res.body as any).error.code, 'NO_SUCH_MULTIPART_UPLOAD');
	});
});
