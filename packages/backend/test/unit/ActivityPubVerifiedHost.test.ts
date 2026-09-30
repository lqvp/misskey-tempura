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
			expect((await app.inject({ url: path, headers: headers(path) })).statusCode).toBe(200);
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
