/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi } from 'vitest';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import CreateEndpoint from '@/server/api/endpoints/admin/avatar-decorations/create.js';
import UpdateEndpoint from '@/server/api/endpoints/admin/avatar-decorations/update.js';

describe('avatar decoration safety', () => {
	test('import preserves valid transforms and defaults invalid values for existing and new decorations', async () => {
		const transforms = { angle: 0.25, flipH: true, offsetX: -0.1 };
		const decorations = [
			{ id: 'existing', url: 'https://remote.example/one.png', ...transforms },
			{ id: 'new', url: 'https://remote.example/two.png', ...transforms },
			{ id: 'invalid', url: 'https://remote.example/three.png', angle: Infinity, flipH: 'true', offsetX: 1 },
			{ id: 'untrusted', url: 'https://elsewhere.example/one.png', ...transforms },
		];
		const create = vi.fn();
		const service: any = Object.assign(Object.create(ApPersonService.prototype), {
			federatedInstanceService: { fetch: async () => ({ softwareName: 'misskey', host: 'remote.example' }) },
			httpRequestService: { send: async () => ({ json: async () => ({ avatarDecorations: decorations }) }) },
			avatarDecorationService: { getAll: async () => [{ id: 'existing' }], create },
		});
		const result = await service.resolveAvatarAndBanner({ id: 'user', uri: 'https://remote.example/users/user' }, 'remote.example', null, null);
		expect(result.avatarDecorations).toEqual([
			{ id: 'existing', ...transforms }, { id: 'new', ...transforms }, { id: 'invalid', angle: 0, flipH: false, offsetX: 0 },
		]);
		expect(create).toHaveBeenCalledTimes(2);
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
