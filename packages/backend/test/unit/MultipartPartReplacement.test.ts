/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import UploadPartEndpoint from '@/server/api/endpoints/drive/files/upload-multipart-part.js';
import { MULTIPART_STAGING_QUOTA_BYTES } from '@/misc/multipart-staging.js';

test('a part created while waiting for the lock is replaced without consuming quota or incrementing completedParts', async () => {
	const dir = fs.mkdtempSync(join(tmpdir(), 'multipart-replacement-'));
	const partDir = join(dir, 'multipart', 'upload');
	const partPath = join(partDir, 'part_1');
	const incoming = join(dir, 'incoming');
	fs.writeFileSync(incoming, 'replacement');
	const upload = { id: 'upload', totalParts: 1, completedParts: 1, expiresAt: new Date(Date.now() + 60000) };
	const transaction = vi.fn();
	const repository = {
		findOneBy: async () => upload, exists: async () => true, findBy: async () => [upload], manager: { transaction },
	};
	const redis = {
		set: vi.fn(async () => {
			// Simulate the preceding lock holder completing this part before we acquire the lock.
			fs.mkdirSync(partDir, { recursive: true });
			fs.writeFileSync(partPath, '');
			fs.truncateSync(partPath, MULTIPART_STAGING_QUOTA_BYTES);
			return 'OK';
		}),
		get: vi.fn().mockResolvedValue(null), del: vi.fn(),
	};
	try {
		const endpoint = new UploadPartEndpoint(repository as any, { multipartTempDir: dir } as any, redis as any);
		await expect(endpoint.exec({ id: 'upload', partNumber: 1 }, { id: 'viewer' } as any, null, { name: 'part', path: incoming }))
			.resolves.toMatchObject({ id: 'upload', partNumber: 1 });
		expect(fs.readFileSync(partPath, 'utf8')).toBe('replacement');
		expect(transaction).not.toHaveBeenCalled();
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});
