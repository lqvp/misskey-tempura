/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { beforeEach, describe, test, expect, vi } from 'vitest';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import CreateEndpoint from '@/server/api/endpoints/admin/avatar-decorations/create.js';
import UpdateEndpoint from '@/server/api/endpoints/admin/avatar-decorations/update.js';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
beforeEach(() => vi.mocked(lookup as (hostname: string, options: { all: true }) => Promise<LookupAddress[]>).mockResolvedValue([{ address: '93.184.216.34', family: 4 }]));

describe('avatar decoration safety', () => {
	test('import preserves valid transforms and defaults invalid values for existing and new decorations', async () => {
		const transforms = { angle: 0.25, flipH: true, offsetX: -0.1 };
		const decorations = [
			{ id: 'existing', url: 'https://remote.example/one.png', ...transforms },
			{ id: 'new', url: 'https://remote.example/two.png', ...transforms },
			{ id: 'invalid', url: 'https://remote.example/three.png', angle: Infinity, flipH: 'true', offsetX: 1 },
			{ id: 'external', url: 'https://storage.example/one.png', ...transforms },
			{ id: 'private', url: 'https://127.0.0.1/one.png', ...transforms },
			{ id: 'failed', url: 'https://storage.example/failed.png', ...transforms },
			{ id: 'not-image', url: 'https://storage.example/file.txt', ...transforms },
		];
		const create = vi.fn(async opts => opts);
		const uploadFromUrl = vi.fn(async ({ url }) => {
			if (url.endsWith('failed.png')) throw new Error('Invalid remote URL');
			return { url: `https://local.example/${url.split('/').pop()}`, type: url.endsWith('.txt') ? 'text/plain' : 'image/png' };
		});
		const service: any = Object.assign(Object.create(ApPersonService.prototype), {
			config: { allowedPrivateNetworks: [] },
			logger: { warn: vi.fn() },
			driveService: { uploadFromUrl, deleteFile: vi.fn() },
			federatedInstanceService: { fetch: async () => ({ softwareName: 'misskey', host: 'remote.example' }) },
			httpRequestService: { send: async () => ({ json: async () => ({ avatarDecorations: decorations }) }) },
			avatarDecorationService: { getAll: async () => [{ id: 'existing' }], create },
		});
		const result = await service.resolveAvatarAndBanner({ id: 'user', uri: 'https://remote.example/users/user' }, 'remote.example', null, null);
		expect(result.avatarDecorations).toEqual([
			{ id: 'existing', ...transforms }, { id: 'new', ...transforms }, { id: 'invalid', angle: 0, flipH: false, offsetX: 0 }, { id: 'external', ...transforms },
		]);
		expect(create).toHaveBeenCalledTimes(3);
		expect(create).toHaveBeenCalledWith(expect.objectContaining({ id: 'external', url: 'https://local.example/one.png' }));
		expect(uploadFromUrl).toHaveBeenCalledWith({ url: 'https://storage.example/one.png', user: null, force: true, isLink: false });
		expect(uploadFromUrl).not.toHaveBeenCalledWith(expect.objectContaining({ url: 'https://127.0.0.1/one.png' }));
	});

	test.each(['create', 'update'] as const)('%s awaits DNS validation before copying', async operation => {
		vi.mocked(lookup as (hostname: string, options: { all: true }) => Promise<LookupAddress[]>).mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);
		const drive = { uploadFromUrl: vi.fn() };
		const config = { allowedPrivateNetworks: [] } as any;
		const endpoint = operation === 'create'
			? new CreateEndpoint(config, {} as any, drive as any, {} as any)
			: new UpdateEndpoint(config, {} as any, drive as any);
		await expect(endpoint.exec({ id: 'decoration', name: 'test', description: '', url: 'https://storage.example/image.png' }, {} as any, null)).rejects.toMatchObject({ code: 'INVALID_REMOTE_URL' });
		expect(drive.uploadFromUrl).not.toHaveBeenCalled();
	});

	test.each(['create', 'update'] as const)('%s copies the source without deleting a potentially referenced file', async operation => {
		const drive = { uploadFromUrl: vi.fn().mockResolvedValue({ id: 'copy', url: 'https://local.example/copy.png' }), deleteFile: vi.fn() };
		const decorations = { create: vi.fn(async (opts: any) => ({ id: 'decoration', ...opts })), update: vi.fn() };
		const config = { url: 'https://local.example', host: 'local.example', allowedPrivateNetworks: [] } as any;
		const endpoint = operation === 'create'
			? new CreateEndpoint(config, decorations as any, drive as any, { parse: () => ({ date: new Date(0) }) } as any)
			: new UpdateEndpoint(config, decorations as any, drive as any);
		await endpoint.exec({ id: 'decoration', name: 'test', description: '', url: 'https://local.example/source.png' }, {} as any, null);
		expect(drive.deleteFile).not.toHaveBeenCalled();
		expect(drive.uploadFromUrl).toHaveBeenCalledOnce();
		expect(decorations[operation]).toHaveBeenCalled();
	});
});
