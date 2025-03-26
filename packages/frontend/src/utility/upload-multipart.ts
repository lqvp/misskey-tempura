/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { reactive, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { v4 as uuid } from 'uuid';
import { apiUrl } from '@@/js/config.js';
import { $i } from '@/i.js';
import { alert } from '@/os.js';
import { i18n } from '@/i18n.js';
import { uploads } from '@/utility/upload.js';

// Size of each chunk in bytes (5MB)
const CHUNK_SIZE = 5 * 1024 * 1024;

// Maximum size for standard upload (100MB)
const MAX_STANDARD_UPLOAD_SIZE = 100 * 1024 * 1024;

/**
 * Handles file upload with multipart support for large files
 */
export async function uploadFileMultipart(
	file: File,
	folder?: string | Misskey.entities.DriveFolder | null,
	name?: string,
	sensitive?: boolean,
	force?: boolean,
): Promise<Misskey.entities.DriveFile> {
	if ($i == null) throw new Error('Not logged in');

	const _folder = typeof folder === 'string' ? folder : folder?.id;
	const fileName = name ?? file.name ?? 'untitled';

	// If file is smaller than max standard upload size, use regular upload
	if (file.size <= MAX_STANDARD_UPLOAD_SIZE) {
		const formData = new FormData();
		formData.append('i', $i.token);
		formData.append('file', file);
		formData.append('name', fileName);
		if (_folder) formData.append('folderId', _folder);
		if (sensitive) formData.append('isSensitive', 'true');
		if (force) formData.append('force', 'true');

		return window.fetch(`${apiUrl}/drive/files/create`, {
			method: 'POST',
			body: formData,
		}).then(res => res.json());
	}

	// For larger files, use multipart upload
	// Step 1: Initiate multipart upload
	const id = uuid();
	const ctx = reactive({
		id,
		name: fileName,
		progressMax: file.size,
		progressValue: 0,
		img: file.type.startsWith('image/') ? window.URL.createObjectURL(file) : '',
	});

	uploads.value.push(ctx);

	try {
		// Calculate total parts
		const totalParts = Math.ceil(file.size / CHUNK_SIZE);

		// Step 1: Create multipart upload
		const createMultipartRes = await window.fetch(`${apiUrl}/drive/files/create-multipart-upload`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				i: $i.token,
				name: fileName,
				folderId: _folder,
				isSensitive: sensitive,
				force: force,
				totalSize: file.size,
				totalParts: totalParts,
			}),
		});

		if (!createMultipartRes.ok) {
			const error = await createMultipartRes.json();
			throw new Error(error.error?.message || 'Failed to create multipart upload');
		}

		const { id: uploadId } = await createMultipartRes.json();

		// Step 2: Upload parts
		const uploadPromises = [];
		let completedSize = 0;

		for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
			const start = (partNumber - 1) * CHUNK_SIZE;
			const end = Math.min(partNumber * CHUNK_SIZE, file.size);
			const chunk = file.slice(start, end);

			const uploadPartPromise = uploadPart(uploadId, partNumber, chunk).then(() => {
				completedSize += chunk.size;
				ctx.progressValue = completedSize;
				return { partNumber };
			});

			uploadPromises.push(uploadPartPromise);
		}

		// Upload parts in parallel and wait for all to complete
		const uploadPartResults = await Promise.all(uploadPromises);

		// Step 3: Complete multipart upload
		const completeMultipartRes = await window.fetch(`${apiUrl}/drive/files/complete-multipart-upload`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				i: $i.token,
				id: uploadId,
			}),
		});

		if (!completeMultipartRes.ok) {
			const error = await completeMultipartRes.json();
			throw new Error(error.error?.message || 'Failed to complete multipart upload');
		}

		const driveFile = await completeMultipartRes.json();
		uploads.value = uploads.value.filter(x => x.id !== id);

		return driveFile;
	} catch (err) {
		uploads.value = uploads.value.filter(x => x.id !== id);
		console.error('Multipart upload failed:', err);

		alert({
			type: 'error',
			title: i18n.ts.failedToUpload,
			text: err instanceof Error ? err.message : i18n.ts.undefined,
		});

		throw err;
	}
}

/**
 * Uploads a single part/chunk of a multipart upload
 */
async function uploadPart(uploadId: string, partNumber: number, chunk: Blob): Promise<void> {
	if ($i == null) throw new Error('Not logged in');

	const formData = new FormData();
	formData.append('i', $i.token);
	formData.append('id', uploadId);
	formData.append('partNumber', partNumber.toString());
	formData.append('file', chunk);

	const response = await window.fetch(`${apiUrl}/drive/files/upload-multipart-part`, {
		method: 'POST',
		body: formData,
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error?.message || `Failed to upload part ${partNumber}`);
	}

	return response.json();
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
