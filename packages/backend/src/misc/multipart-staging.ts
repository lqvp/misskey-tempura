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
 * スティージングディレクトリのルート。
 * 下位階層の各ディレクトリ名がそのままアップロード ID になる。
 */
export function getMultipartStagingRoot(dataDir: string): string {
	return `${dataDir}/multipart`;
}

/**
 * 旧実装のスティージングディレクトリ。
 * パス変更前に作成されたアップロードの互換性のために残す。
 */
export function getLegacyMultipartStagingDir(uploadId: string): string {
	return `/tmp/misskey_multipart_${uploadId}`;
}

/**
 * 旧実装のスティージングが置かれていたディレクトリと識別プレフィックス。
 */
export const LEGACY_MULTIPART_STAGING_ROOT = '/tmp';
export const LEGACY_MULTIPART_STAGING_PREFIX = 'misskey_multipart_';

/**
 * アップロードのパート读写に使うスティージングディレクトリを解決する。
 * 新しいパスにデータが無い場合は旧パスへフォールバックし、
 * どちらにもデータが無い場合は新しいパスを返す。
 * パート追記・完了・クリーンアップのすべてでこの関数を使うこと。
 */
export function resolveMultipartStagingDir(dataDir: string, uploadId: string): string {
	const dir = getMultipartStagingDir(dataDir, uploadId);
	if (!fs.existsSync(dir)) {
		const legacy = getLegacyMultipartStagingDir(uploadId);
		if (fs.existsSync(legacy)) {
			return legacy;
		}
	}
	return dir;
}

/**
 * 新旧どちらのスティージングディレクトリに退避済みのバイト数の合計。
 * クォータ判定など、場所に依存しない集計に使う。
 */
export function getUploadStagedBytes(dataDir: string, uploadId: string): number {
	return getStagedBytesOfUpload(getMultipartStagingDir(dataDir, uploadId))
		+ getStagedBytesOfUpload(getLegacyMultipartStagingDir(uploadId));
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
