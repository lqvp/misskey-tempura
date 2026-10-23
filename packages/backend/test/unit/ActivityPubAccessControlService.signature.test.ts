/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createSign, generateKeyPairSync } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ActivityPubAccessControlService } from '@/core/ActivityPubAccessControlService.js';
import { DI } from '@/di-symbols.js';
import { UtilityService } from '@/core/UtilityService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { ApDbResolverService } from '@/core/activitypub/ApDbResolverService.js';
import { ApResolverService } from '@/core/activitypub/ApResolverService.js';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import type { MiNote } from '@/models/Note.js';
import type { FastifyRequest } from 'fastify';

// httpSignature はモックせず、本物の RSA 署名で解析と検証を通す

const OWN_HOST = 'test.example.com';
const KEY_ID = 'https://allowed.example.com/users/a#main-key';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function signedRequest(opts: { path?: string; signedPath?: string; host?: string; signedHost?: string; date?: Date } = {}): FastifyRequest {
	const path = opts.path ?? '/notes/abc';
	const host = opts.host ?? OWN_HOST;
	const date = (opts.date ?? new Date()).toUTCString();
	const signingString = [
		`(request-target): get ${opts.signedPath ?? path}`,
		`host: ${opts.signedHost ?? host}`,
		`date: ${date}`,
	].join('\n');
	const signature = createSign('sha256').update(signingString).sign(privateKey, 'base64');
	const headers = {
		host,
		date,
		accept: 'application/activity+json',
		signature: `keyId="${KEY_ID}",algorithm="rsa-sha256",headers="(request-target) host date",signature="${signature}"`,
	};
	return { headers, url: path, raw: { method: 'GET', url: path, httpVersion: '1.1', headers } } as unknown as FastifyRequest;
}

const includeNote = { id: 'n', visibility: 'public', deliveryTargets: { mode: 'include', hosts: ['allowed.example.com'] } } as MiNote;

describe('ActivityPubAccessControlService (real HTTP signatures)', () => {
	let service: ActivityPubAccessControlService;

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [
				ActivityPubAccessControlService,
				{ provide: DI.config, useValue: { host: OWN_HOST, hostname: OWN_HOST } },
				{ provide: DI.meta, useValue: { blockedHosts: [], requireSignedApFetch: false } },
				{ provide: DI.instancesRepository, useValue: { findOneBy: vi.fn(async () => null), existsBy: vi.fn(async () => true) } },
				{ provide: DI.userPublickeysRepository, useValue: { findOneBy: vi.fn(async () => null) } },
				{
					provide: UtilityService, useValue: {
						toPuny: (h: string) => h.toLowerCase(),
						isBlockedHost: () => false,
						isFederationAllowedHost: () => true,
					},
				},
				{
					provide: ApDbResolverService, useValue: {
						getAuthUserFromKeyId: vi.fn(async () => ({ user: { id: 'u', host: 'allowed.example.com', uri: 'https://allowed.example.com/users/a' }, key: { keyPem: publicKeyPem } })),
						getAuthUserFromApId: vi.fn(async () => null),
					},
				},
				{ provide: ApResolverService, useValue: { createResolver: vi.fn() } },
				{ provide: ApPersonService, useValue: { updatePerson: vi.fn(async () => {}) } },
				{ provide: LoggerService, useValue: { getLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }) } },
			],
		}).compile();
		service = module.get(ActivityPubAccessControlService);
	});

	test('正しい署名は通る', async () => {
		expect(await service.checkNoteAccess(includeNote, signedRequest())).toBe(true);
	});

	test('Host ヘッダーの大文字小文字や :443 の違いは許す', async () => {
		expect(await service.checkNoteAccess(includeNote, signedRequest({ host: 'TEST.example.com:443' }))).toBe(true);
	});

	test('他のサーバー宛ての署名は通らない', async () => {
		expect(await service.checkNoteAccess(includeNote, signedRequest({ host: 'other.example.com' }))).toBe(false);
	});

	test('署名した Host と違う Host ヘッダーでは通らない', async () => {
		expect(await service.checkNoteAccess(includeNote, signedRequest({ signedHost: 'other.example.com' }))).toBe(false);
	});

	test('時刻が 300 秒以上ずれた署名は通らない', async () => {
		expect(await service.checkNoteAccess(includeNote, signedRequest({ date: new Date(Date.now() - 1000 * 60 * 10) }))).toBe(false);
	});

	test('署名とは別のパスへのリクエストでは通らない', async () => {
		expect(await service.checkNoteAccess(includeNote, signedRequest({ signedPath: '/notes/other' }))).toBe(false);
	});
});

describe('ActivityPubAccessControlService.isVerifiedRequester', () => {
	const build = async (getAuthUserFromKeyId: (keyId: string) => Promise<unknown>) => {
		const module = await Test.createTestingModule({
			providers: [
				ActivityPubAccessControlService,
				{ provide: DI.config, useValue: { host: OWN_HOST, hostname: OWN_HOST } },
				{ provide: DI.meta, useValue: { blockedHosts: [], requireSignedApFetch: false } },
				{ provide: DI.instancesRepository, useValue: { findOneBy: vi.fn(async () => null), existsBy: vi.fn(async () => true) } },
				{ provide: DI.userPublickeysRepository, useValue: { findOneBy: vi.fn(async () => null) } },
				{
					provide: UtilityService, useValue: {
						toPuny: (h: string) => h.toLowerCase(),
						isBlockedHost: () => false,
						isFederationAllowedHost: () => true,
					},
				},
				{
					provide: ApDbResolverService, useValue: {
						getAuthUserFromKeyId: vi.fn(getAuthUserFromKeyId),
						getAuthUserFromApId: vi.fn(async () => null),
					},
				},
				{ provide: ApResolverService, useValue: { createResolver: vi.fn() } },
				{ provide: ApPersonService, useValue: { updatePerson: vi.fn(async () => {}) } },
				{ provide: LoggerService, useValue: { getLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }) } },
			],
		}).compile();
		return module.get(ActivityPubAccessControlService);
	};

	const knownSigner = async () => ({ user: { id: 'u', host: 'allowed.example.com', uri: 'https://allowed.example.com/users/a' }, key: { keyPem: publicKeyPem } });

	test('検証できた署名の取得は true (匿名ではない)', async () => {
		const service = await build(knownSigner);
		expect(await service.isVerifiedRequester(signedRequest())).toBe(true);
	});

	test('署名が無い取得は false (匿名)', async () => {
		const service = await build(knownSigner);
		const unsigned = { headers: { host: OWN_HOST, accept: 'application/activity+json' }, url: '/notes/abc', raw: { method: 'GET', url: '/notes/abc', httpVersion: '1.1', headers: {} } } as unknown as FastifyRequest;
		expect(await service.isVerifiedRequester(unsigned)).toBe(false);
	});

	test('登録済みホストの未知の署名者はアカウントを取りに行って検証し、見つからなければ false (匿名)', async () => {
		const getAuthUserFromKeyId = vi.fn(async () => null);
		const service = await build(getAuthUserFromKeyId);
		// モックの instancesRepository.existsBy は true (登録済みホスト) なので取得を試みる
		// (getAuthUserFromApId は null を返すため最終的に検証失敗)
		expect(await service.isVerifiedRequester(signedRequest())).toBe(false);
		expect(getAuthUserFromKeyId).toHaveBeenCalledTimes(1);
	});

	test('未登録ホストの未知の署名者は取得に行かず false (匿名) に分類する', async () => {
		const module = await Test.createTestingModule({
			providers: [
				ActivityPubAccessControlService,
				{ provide: DI.config, useValue: { host: OWN_HOST, hostname: OWN_HOST } },
				{ provide: DI.meta, useValue: { blockedHosts: [], requireSignedApFetch: false } },
				{ provide: DI.instancesRepository, useValue: { findOneBy: vi.fn(async () => null), existsBy: vi.fn(async () => false) } },
				{ provide: DI.userPublickeysRepository, useValue: { findOneBy: vi.fn(async () => null) } },
				{
					provide: UtilityService, useValue: {
						toPuny: (h: string) => h.toLowerCase(),
						isBlockedHost: () => false,
						isFederationAllowedHost: () => true,
					},
				},
				{
					provide: ApDbResolverService, useValue: {
						getAuthUserFromKeyId: vi.fn(async () => null),
						getAuthUserFromApId: vi.fn(async () => null),
					},
				},
				{ provide: ApResolverService, useValue: { createResolver: vi.fn() } },
				{ provide: ApPersonService, useValue: { updatePerson: vi.fn(async () => {}) } },
				{ provide: LoggerService, useValue: { getLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }) } },
			],
		}).compile();
		const service = module.get(ActivityPubAccessControlService);
		expect(await service.isVerifiedRequester(signedRequest())).toBe(false);
	});

	test('不正な署名は false (匿名)', async () => {
		const service = await build(knownSigner);
		const { privateKey: otherKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
		const date = new Date().toUTCString();
		const signingString = ['(request-target): get /notes/abc', `host: ${OWN_HOST}`, `date: ${date}`].join('\n');
		const badSignature = createSign('sha256').update(signingString).sign(otherKey, 'base64');
		const request = {
			headers: {
				host: OWN_HOST,
				date,
				accept: 'application/activity+json',
				signature: `keyId="${KEY_ID}",algorithm="rsa-sha256",headers="(request-target) host date",signature="${badSignature}"`,
			},
			url: '/notes/abc',
			raw: { method: 'GET', url: '/notes/abc', httpVersion: '1.1', headers: {} },
		} as unknown as FastifyRequest;
		expect(await service.isVerifiedRequester(request)).toBe(false);
	});
});
