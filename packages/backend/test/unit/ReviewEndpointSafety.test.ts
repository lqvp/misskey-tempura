/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { IsNull, MoreThan, Or } from 'typeorm';
import UnassignEndpoint from '@/server/api/endpoints/roles/unassign.js';
import SearchEndpoint from '@/server/api/endpoints/search-avatar-decorations.js';

import UploadEndpoint from '@/server/api/endpoints/drive/files/upload-from-url.js';
import { FileServerProxyHandler } from '@/server/file/FileServerProxyHandler.js';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));

afterEach(() => vi.useRealTimers());

describe('role assignment expiry', () => {
	test.each([false, true])('only an active assignment can reach owner deletion (active=%s)', async active => {
		vi.useFakeTimers();
		const now = new Date('2026-01-01T00:00:00Z');
		vi.setSystemTime(now);
		const role = { id: 'role', userId: 'owner', permissionGroup: 'Community' };
		const query = { where: vi.fn().mockReturnThis(), andWhere: vi.fn().mockReturnThis(), getCount: vi.fn().mockResolvedValue(1) };
		const assignments = { findOneBy: vi.fn().mockResolvedValue(active ? { userId: 'owner' } : null), createQueryBuilder: vi.fn().mockReturnValue(query) };
		const roles = { findOneBy: vi.fn().mockResolvedValue(role), delete: vi.fn() };
		const events = { publishInternalEvent: vi.fn() };
		const roleService = { unassign: vi.fn() };
		const endpoint = new UnassignEndpoint(assignments as any, roles as any, events as any, roleService as any);
		const result = endpoint.exec({ roleId: 'role' }, { id: 'owner' } as any, null);
		if (active) await result;
		else await expect(result).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
		// Strict MoreThan excludes assignments expiring exactly at the captured time.
		expect(assignments.findOneBy).toHaveBeenCalledWith({ roleId: 'role', userId: 'owner', expiresAt: Or(IsNull(), MoreThan(now)) });
		expect(roles.delete).toHaveBeenCalledTimes(active ? 1 : 0);
		expect(events.publishInternalEvent).toHaveBeenCalledTimes(active ? 1 : 0);
		expect(query.getCount).toHaveBeenCalledTimes(active ? 1 : 0);
	});
});

test('decoration search drops deleted role IDs without mutating cached decorations', async () => {
	const decorations = [
		{ id: 'one', name: 'one', description: '', roleIdsThatCanBeUsedThisDecoration: ['deleted'] },
		{ id: 'two', name: 'two', description: '', roleIdsThatCanBeUsedThisDecoration: ['public', 'deleted', 'private'] },
	];
	const endpoint = new SearchEndpoint({ getAll: async () => decorations } as any, {
		getUserPolicies: async () => ({}),
		getRoles: async () => [{ id: 'public', isPublic: true }, { id: 'private', isPublic: false }],
	} as any);
	const result = await endpoint.exec({ query: '' }, { id: 'user' } as any, null);
	expect(result.map((decoration: any) => decoration.roleIdsThatCanBeUsedThisDecoration)).toEqual([[], ['public', 'private']]);
	expect(decorations[0].roleIdsThatCanBeUsedThisDecoration).toEqual(['deleted']);
});

test('upload and file proxy await DNS validation before fetching', async () => {
	vi.mocked(lookup as (hostname: string, options: { all: true }) => Promise<LookupAddress[]>).mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);
	const config = { url: 'https://local.example', allowedPrivateNetworks: [] } as any;
	const drive = { uploadFromUrl: vi.fn() };
	const endpoint = new UploadEndpoint({} as any, drive as any, {} as any, config);
	await expect(endpoint.exec({ url: 'https://storage.example/image' }, { id: 'user' } as any, null)).rejects.toMatchObject({ code: 'INVALID_URL' });
	expect(drive.uploadFromUrl).not.toHaveBeenCalled();
	const resolver = { downloadAndDetectTypeFromUrl: vi.fn() };
	const proxy = new FileServerProxyHandler(config, resolver as any, '', {} as any);
	await expect((proxy as any).getStreamAndTypeFromUrl('https://storage.example/image')).rejects.toThrow('Invalid url');
	expect(resolver.downloadAndDetectTypeFromUrl).not.toHaveBeenCalled();
});
