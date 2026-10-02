/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';

/**
 * 未完了マルチパートアップロードのスティージング合計クォータ（アカウント単位）。
 * 進行中アップロードの一時的な退避量をアカウントあたり 5 GiB に抑える。
 */
export const MULTIPART_STAGING_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;

/**
 * マルチパートアップロードのスティージングディレクトリ。
 * 共有・世界読み取り可能な /tmp を避け、アプリ所有のデータディレクトリ配下に置く。
 */
export function getMultipartStagingDir(dataDir: string, uploadId: string): string {
	return `${dataDir}/multipart/${uploadId}`;
}

/**
 * スティージングディレクトリ内に退避済みのバイト数の合計。
 * ディレクトリが存在しない場合は 0 を返す。
 */
export function getStagedBytesOfUpload(stagingDir: string): number {
	let names: string[];
	try {
		names = fs.readdirSync(stagingDir);
	} catch {
		return 0;
	}
	let total = 0;
	for (const name of names) {
		try {
			total += fs.statSync(`${stagingDir}/${name}`).size;
		} catch {
			// readdir と stat の間になくなったファイルはスキップ
		}
	}
	return total;
}
