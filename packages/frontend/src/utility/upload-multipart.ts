/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { apiUrl } from '@@/js/config.js';
import { $i } from '@/i.js';
import { alert } from '@/os.js';
import { i18n } from '@/i18n.js';

// Maximum size for standard upload (95MB - Cloudflare制限を考慮)
const MAX_STANDARD_UPLOAD_SIZE = 95 * 1024 * 1024;

// PostgreSQLのinteger型の最大値制限に基づく最大ファイルサイズ (2GB)
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

// ファイルサイズに応じた最適なチャンクサイズを計算
function calculateOptimalChunkSize(fileSize: number): number {
	// 小さいファイル (95MB以下): 10MB チャンク
	if (fileSize <= 95 * 1024 * 1024) {
		return 10 * 1024 * 1024;
	} else if (fileSize <= 1024 * 1024 * 1024) {
		// 中サイズファイル (95MB〜1GB): 20MB チャンク
		return 20 * 1024 * 1024;
	} else {
		// 大きいファイル (1GB以上): 50MB チャンク
		return 50 * 1024 * 1024;
	}
}

/**
 * Handles file upload with multipart support for large files
 */
export async function uploadFileMultipart(
	file: File,
	folderId?: string | null,
	name?: string,
	onProgress?: (ctx: { total: number; loaded: number }) => void,
): Promise<Misskey.entities.DriveFile> {
	if ($i == null) {
		throw new Error('Not logged in');
	}

	// ファイルサイズが制限を超えていないか確認
	if (file.size > MAX_FILE_SIZE) {
		// エラーをalert関数で表示
		await alert({
			type: 'error',
			title: i18n.ts._uploadMultipart.error,
			text: i18n.ts._uploadMultipart.overflow,
		});
		// エラー表示後に例外をスロー
		throw new Error('File too large');
	}

	const fileName = name ?? (file instanceof File ? file.name : 'untitled');

	// If file is smaller than max standard upload size, use regular upload
	if (file.size <= MAX_STANDARD_UPLOAD_SIZE) {
		const formData = new FormData();
		formData.append('i', $i.token);
		formData.append('file', file);
		formData.append('name', fileName);
		if (folderId) {
			formData.append('folderId', folderId);
		}

		return window.fetch(`${apiUrl}/drive/files/create`, {
			method: 'POST',
			body: formData,
		}).then(res => res.json());
	}

	// For larger files, use multipart upload
	// Step 1: Initiate multipart upload
	let completedSize = 0;

	// Report initial progress
	onProgress?.({ total: file.size, loaded: 0 });

	// ファイルサイズに応じた最適なチャンクサイズを取得
	const chunkSize = calculateOptimalChunkSize(file.size);
	console.log(`File size: ${(file.size / (1024 * 1024)).toFixed(2)}MB, Using chunk size: ${(chunkSize / (1024 * 1024)).toFixed(2)}MB`);

	// Calculate total parts based on dynamic chunk size
	const totalParts = Math.ceil(file.size / chunkSize);

	// Step 1: Create multipart upload
	const createMultipartRes = await window.fetch(`${apiUrl}/drive/files/create-multipart-upload`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			i: $i.token,
			name: fileName,
			folderId: folderId,
			totalSize: file.size,
			totalParts: totalParts,
		}),
	});

	if (!createMultipartRes.ok) {
		const error = await createMultipartRes.json();
		throw new Error(error.error?.message ?? 'Failed to create multipart upload');
	}

	const { id: uploadId } = await createMultipartRes.json();

	// Step 2: Upload parts with dynamic queue
	// Maximum number of concurrent uploads
	const MAX_CONCURRENT_UPLOADS = 5;
	const results: { partNumber: number }[] = [];

	// Create a queue of all parts that need to be uploaded
	const partQueue: number[] = [];
	for (let i = 1; i <= totalParts; i++) {
		partQueue.push(i);
	}

	// Process the queue with controlled concurrency
	const processQueue = async () => {
		const workers: Promise<void>[] = [];
		// アップロード失敗時のグローバルカウント
		let globalRetryCount = 0;
		const MAX_GLOBAL_RETRIES = 10;
		let isAborting = false;
		// 429レート制限エラーを検出したかどうか
		let isRateLimited = false;

		const processNext = async (): Promise<void> => {
			// レート制限発生時または処理中止中は何も処理しない
			if (isRateLimited || isAborting) {
				return;
			}

			// Get next part from queue
			const partNumber = partQueue.shift();
			if (partNumber === undefined) return;

			// Upload the part
			const start = (partNumber - 1) * chunkSize;
			const end = Math.min(partNumber * chunkSize, file.size);
			const chunk = file.slice(start, end);

			try {
				await uploadPart(uploadId, partNumber, chunk);
				completedSize += chunk.size;
				onProgress?.({ total: file.size, loaded: completedSize });
				results.push({ partNumber });
			} catch (err) {
				// レート制限エラー(429)が発生した場合
				if (err instanceof RateLimitExceededError) {
					console.error('Rate limit exceeded, aborting upload:', err.message);
					isRateLimited = true;
					isAborting = true;
					await alert({
						type: 'error',
						title: i18n.ts._uploadMultipart.error,
						text: i18n.ts._uploadMultipart.rateLimitError ?? 'Rate limit exceeded',
					});
					throw new Error('Rate limit exceeded');
				}

				// Re-add failed part to the beginning of the queue for retry
				partQueue.unshift(partNumber);

				// エラーの重大度を評価
				// グローバルリトライ回数を超えた場合はアップロードを中止
				globalRetryCount++;
				if (globalRetryCount > MAX_GLOBAL_RETRIES) {
					isAborting = true;
					console.error(`Too many global retries (${globalRetryCount}), aborting multipart upload.`);
					await alert({
						type: 'error',
						title: i18n.ts._uploadMultipart.error,
						text: i18n.tsx._uploadMultipart.tooManyRetries({ retries: MAX_GLOBAL_RETRIES }) ?? `Too many retries (${MAX_GLOBAL_RETRIES})`,
					});
					throw new Error('Too many retries');
				}

				console.error(`Error uploading part ${partNumber}:`, err);

				// 少し待ってから次の処理を試行（制御フローの混雑を緩和）
				await new Promise(resolve => window.setTimeout(resolve, 500));
			}

			// Process next part if any remain and not aborting
			if (partQueue.length > 0) {
				return processNext();
			}
		};

		// Start workers
		for (let i = 0; i < Math.min(MAX_CONCURRENT_UPLOADS, totalParts); i++) {
			workers.push(processNext());
		}

		// Wait for all workers to complete
		await Promise.all(workers);
	};

	// Start processing the queue
	await processQueue();

	// Step 3: Complete multipart upload
	const completeMultipartRes = await window.fetch(`${apiUrl}/drive/files/complete-multipart-upload`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			i: $i.token,
			id: uploadId,
			parts: results.sort((a, b) => a.partNumber - b.partNumber),
		}),
	});

	if (!completeMultipartRes.ok) {
		const error = await completeMultipartRes.json();
		throw new Error(error.error?.message ?? 'Failed to complete multipart upload');
	}

	return completeMultipartRes.json();
}

/**
 * レート制限エラーを表現する特別なエラークラス
 */
class RateLimitExceededError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'RateLimitExceededError';
	}
}

/**
 * Uploads a single part/chunk of a multipart upload
 */
async function uploadPart(uploadId: string, partNumber: number, chunk: Blob): Promise<void> {
	if ($i == null) {
		throw new Error('Not logged in');
	}

	const formData = new FormData();
	formData.append('i', $i.token);
	formData.append('id', uploadId);
	formData.append('partNumber', partNumber.toString());
	formData.append('file', chunk);

	const res = await window.fetch(`${apiUrl}/drive/files/upload-multipart-part`, {
		method: 'POST',
		body: formData,
	});

	if (!res.ok) {
		const error = await res.json();
		if (res.status === 429) {
			throw new RateLimitExceededError(error.error?.message ?? 'Rate limit exceeded');
		}
		throw new Error(error.error?.message ?? 'Failed to upload part');
	}
}

/**
 * Detects if the browser can support multipart uploads
 */
export function canUseMultipartUpload(): boolean {
	// Check for necessary APIs: Fetch, Blob.slice, etc.
	return typeof Blob !== 'undefined' &&
		typeof Blob.prototype.slice !== 'undefined' &&
		typeof window.fetch !== 'undefined' &&
		typeof FormData !== 'undefined';
}
