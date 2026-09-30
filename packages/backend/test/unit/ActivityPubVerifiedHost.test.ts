/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { generateKeyPairSync, createSign } from 'node:crypto';
import Fastify from 'fastify';
import { describe, test, expect, vi } from 'vitest';
import { ActivityPubServerService } from '@/server/ActivityPubServerService.js';
import { ActivityPubAccessControlService } from '@/core/ActivityPubAccessControlService.js';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const keyId = 'https://signer.example/users/actor#main-key';

function headers(path: string, valid = true) {
	const date = new Date().toUTCString();
	const data = `(request-target): get ${path}\nhost: local.example\ndate: ${date}`;
	const signature = createSign('RSA-SHA256').update(valid ? data : 'invalid').sign(keys.privateKey, 'base64');
	return {
		host: 'local.example', date, accept: 'application/activity+json',
		'user-agent': 'Misskey/13.0.0 (https://local.example/) tempura',
		signature: `keyId="${keyId}",algorithm="rsa-sha256",headers="(request-target) host date",signature="${signature}"`,
	};
}

describe('ActivityPub verified host on note routes', () => {
	test.each(['/notes/note', '/notes/note/activity'])('%s uses the signer for instance and delivery restrictions', async path => {
		const settings = { blockedHosts: [] as string[], federation: 'all' };
		const utility = { toPuny: (host: string) => host, isBlockedHost: (hosts: string[], host: string) => hosts.includes(host) };
		const access = new ActivityPubAccessControlService(settings as any, { findOneBy: async () => null } as any, utility as any,
			{ getLogger: () => ({ info: vi.fn(), debug: vi.fn() }) } as any);
		const note = { id: 'note', userHost: null, visibility: 'public', deliveryTargets: { mode: 'include', hosts: ['signer.example'] } };
		const resolver = { getAuthUserFromKeyId: vi.fn(async () => ({ user: { host: 'signer.example' }, key: { keyId, keyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }) } })) };
		const service: any = Object.assign(Object.create(ActivityPubServerService.prototype), {
			config: { host: 'local.example' }, meta: settings, utilityService: utility,
			verifiedHosts: new WeakMap(), apDbResolverService: resolver, activityPubAccessControlService: access,
			notesRepository: { findOneBy: async () => note },
			apRendererService: { addContext: (value: any) => value, renderNote: async () => ({ id: 'note' }), renderCreate: (value: any) => value },
		});
		const app = Fastify();
		app.register((instance, options, done) => service.createServer(instance, options, done));
		try {
			const allowed = await app.inject({ url: path, headers: headers(path) });
			expect(allowed.statusCode).toBe(200);
			expect(allowed.headers['cache-control']).toBe('no-store');
			expect(resolver.getAuthUserFromKeyId).toHaveBeenCalledTimes(1);
			note.deliveryTargets.hosts = ['local.example'];
			expect((await app.inject({ url: path, headers: headers(path) })).statusCode).toBe(404);
			note.deliveryTargets.hosts = ['signer.example'];
			settings.blockedHosts = ['signer.example'];
			expect((await app.inject({ url: path, headers: headers(path) })).statusCode).toBe(404);
			settings.blockedHosts = [];
			expect((await app.inject({ url: path, headers: headers(path, false) })).statusCode).toBe(404);
			const unsigned = headers(path);
			delete (unsigned as any).signature;
			expect((await app.inject({ url: path, headers: unsigned })).statusCode).toBe(404);
		} finally {
			await app.close();
		}
	});
});

describe('ActivityPub unsigned bootstrap', () => {
	test.each([
		['/users/actor', 'system.actor', null, 200],
		['/@system.actor', 'system.actor', null, 200],
		['/users/ordinary', 'ordinary', null, 404],
		['/users/relay', 'system.relay', null, 404],
		['/users/remote', 'system.actor', 'remote.example', 404],
		['/users/ordinary/publickey', 'ordinary', null, 200],
	] as const)('%s unsigned returns %s', async (path, username, host, status) => {
		const settings = { blockedHosts: [] as string[], federation: 'all' };
		const utility = { toPuny: (value: string) => value, isBlockedHost: (hosts: string[], value: string) => hosts.includes(value), isSelfHost: () => false };
		const access = new ActivityPubAccessControlService(settings as any, { findOneBy: async () => null } as any, utility as any,
			{ getLogger: () => ({ info: vi.fn(), debug: vi.fn() }) } as any);
		const resolver = { getAuthUserFromKeyId: vi.fn(async () => null), getAuthUserFromApId: vi.fn(async () => null) };
		const service: any = Object.assign(Object.create(ActivityPubServerService.prototype), {
			config: { host: 'local.example' }, meta: settings, utilityService: utility,
			verifiedHosts: new WeakMap(), apDbResolverService: resolver, activityPubAccessControlService: access,
			usersRepository: { findOneBy: async () => ({ id: 'actor', username, host }) },
			userEntityService: { isLocalUser: () => host === null },
			userKeypairService: { getUserKeypair: async () => ({}) },
			apRendererService: { addContext: (value: any) => value, renderPerson: async () => ({ id: 'actor' }), renderKey: () => ({ id: 'key' }) },
		});
		const app = Fastify();
		app.register((instance, options, done) => service.createServer(instance, options, done));
		try {
			const unsigned = { host: 'local.example', accept: 'application/activity+json' };
			expect((await app.inject({ url: path, headers: unsigned })).statusCode).toBe(status);
			expect(resolver.getAuthUserFromKeyId).not.toHaveBeenCalled();
			expect((await app.inject({ url: path, headers: headers(path, false) })).statusCode).toBe(404);
			settings.federation = 'none';
			expect((await app.inject({ url: path, headers: unsigned })).statusCode).toBe(403);
		} finally {
			await app.close();
		}
	});
});

describe('ActivityPub actor fallback', () => {
	test.each([true, false])('removes only the fragment for discovery and requires the original key ID (matching=%s)', async matching => {
		const resolver = {
			getAuthUserFromKeyId: vi.fn(async () => null),
			getAuthUserFromApId: vi.fn(async () => ({
				user: { host: 'signer.example' },
				key: { keyId: matching ? keyId : 'https://signer.example/users/actor#other', keyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }) },
			})),
		};
		const service: any = Object.assign(Object.create(ActivityPubServerService.prototype), {
			config: { host: 'local.example' }, verifiedHosts: new WeakMap(), apDbResolverService: resolver,
			utilityService: { toPuny: (host: string) => host },
		});
		const app = Fastify();
		app.get('/verify', async request => ({ host: await service.getVerifiedHost(request) }));
		try {
			expect((await app.inject({ url: '/verify', headers: headers('/verify') })).json()).toEqual(matching ? { host: 'signer.example' } : {});
			expect(resolver.getAuthUserFromKeyId).toHaveBeenCalledWith(keyId);
			expect(resolver.getAuthUserFromApId).toHaveBeenCalledWith('https://signer.example/users/actor');
		} finally {
			await app.close();
		}
	});
});
