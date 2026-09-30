/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ActivityPubAccessControlService } from '@/core/ActivityPubAccessControlService.js';
import type { FastifyRequest } from 'fastify';

const request = (userAgent?: string, accept?: string) => ({ headers: {
	'user-agent': userAgent,
	accept,
	signature: 'keyId="https://blocked.example/key"',
} }) as unknown as FastifyRequest;

const note = (mode: 'include' | 'exclude', hosts: string[]) => ({
	id: 'note', visibility: 'public', deliveryTargets: { mode, hosts },
}) as any;

describe('ActivityPubAccessControlService verified attribution', () => {
	let service: ActivityPubAccessControlService;
	let instances: any;
	let utility: any;

	beforeEach(() => {
		instances = { findOneBy: vi.fn().mockResolvedValue(null) };
		utility = {
			toPuny: (host: string) => host.toLowerCase(),
			isBlockedHost: vi.fn((hosts: string[], host: string) => hosts.includes(host)),
		};
		service = new ActivityPubAccessControlService({ blockedHosts: ['blocked.example'] } as any, instances, utility,
			{ getLogger: () => ({ info: vi.fn(), debug: vi.fn() }) } as any);
	});

	test.each([undefined, 'Mozilla/5.0', 'Misskey/13.0.0 (https://local.example/)', 'tempura'])('does not trust unsigned UA %s, even without Accept', async ua => {
		for (const accept of [undefined, 'application/activity+json']) {
			expect(await service.checkAccess(request(ua, accept))).toEqual({ blocked: true, reason: 'unattributable' });
			expect(await service.checkNoteAccess(note('exclude', []), request(ua, accept))).toBe(false);
		}
	});

	test.each(['Misskey/13.0.0 (https://local.example/)', 'tempura', undefined])('enforces the verified blocked host despite UA %s', async ua => {
		expect(await service.checkAccess(request(ua), true, 'blocked.example')).toEqual({ blocked: true, reason: 'blocked', host: 'blocked.example' });
		expect(await service.checkNoteAccess(note('exclude', []), request(ua), 'blocked.example')).toBe(false);
	});

	test('allows a verified unrestricted host without a User-Agent', async () => {
		expect(await service.checkAccess(request(), false, 'CLEAN.EXAMPLE')).toBeNull();
		expect(instances.findOneBy).toHaveBeenCalledWith({ host: 'clean.example' });
	});

	test.each([
		['suspended', { suspensionState: 'manuallySuspended', quarantineLimited: false }],
		['quarantined', { suspensionState: 'none', quarantineLimited: true }],
	])('keeps %s instance restrictions', async (reason, instance) => {
		instances.findOneBy.mockResolvedValue(instance);
		expect(await service.checkAccess(request('tempura'), true, 'remote.example')).toMatchObject({ blocked: true, reason });
	});

	test('applies deliveryTargets to the verified host', async () => {
		const req = request('Misskey/13.0.0 (https://allowed.example/)');
		expect(await service.checkNoteAccess(note('include', ['allowed.example']), req, 'other.example')).toBe(false);
		expect(await service.checkNoteAccess(note('exclude', ['other.example']), req, 'other.example')).toBe(false);
		expect(await service.checkNoteAccess(note('include', ['other.example']), req, 'other.example')).toBe(true);
		expect(await service.checkNoteAccess(note('exclude', ['allowed.example']), req, 'other.example')).toBe(true);
	});
});
