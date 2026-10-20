/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Test, TestingModule } from '@nestjs/testing';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import httpSignature from '@peertube/http-signature';
import { ActivityPubAccessControlService } from '@/core/ActivityPubAccessControlService.js';
import { DI } from '@/di-symbols.js';
import { UtilityService } from '@/core/UtilityService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { ApDbResolverService } from '@/core/activitypub/ApDbResolverService.js';
import type { MiNote } from '@/models/Note.js';
import type { FastifyRequest } from 'fastify';

vi.mock('@peertube/http-signature', () => ({
	default: {
		parseRequest: vi.fn(),
		verifySignature: vi.fn(),
	},
}));

const AP_ACCEPT = 'application/activity+json';

function uaRequest(userAgent: string, accept: string | undefined = AP_ACCEPT): FastifyRequest {
	return {
		headers: {
			...(accept ? { accept } : {}),
			'user-agent': userAgent,
		},
	} as unknown as FastifyRequest;
}

/** 署名付きのリクエスト。解析結果は httpSignature.parseRequest のモックで決まる */
function signedRequest(keyId: string, userAgent = 'http.rb/5.3.0 (Mastodon/4.2.0; +https://ua.example.com/)'): FastifyRequest {
	vi.mocked(httpSignature.parseRequest).mockReturnValue({
		keyId,
		params: { headers: ['(request-target)', 'host', 'date'] },
	} as any);
	return {
		headers: {
			accept: AP_ACCEPT,
			host: 'test.example.com',
			signature: `keyId="${keyId}"`,
			'user-agent': userAgent,
		},
		raw: {},
	} as unknown as FastifyRequest;
}

function note(deliveryTargets: MiNote['deliveryTargets']): MiNote {
	return { id: 'note1', visibility: 'public', deliveryTargets } as MiNote;
}

describe('ActivityPubAccessControlService', () => {
	let service: ActivityPubAccessControlService;
	let mockInstancesRepository: any;
	let mockUtilityService: any;
	let mockApDbResolverService: any;
	let mockMeta: any;

	beforeEach(async () => {
		vi.mocked(httpSignature.parseRequest).mockReset();
		vi.mocked(httpSignature.verifySignature).mockReset();

		mockInstancesRepository = {
			findOneBy: vi.fn(() => Promise.resolve(null)),
		};

		mockUtilityService = {
			toPuny: vi.fn((host: string) => host.toLowerCase()),
			isBlockedHost: vi.fn(() => false),
			isFederationAllowedHost: vi.fn(() => true),
		};

		mockApDbResolverService = {
			getAuthUserFromKeyId: vi.fn(() => Promise.resolve(null)),
			getAuthUserFromApId: vi.fn(() => Promise.resolve(null)),
		};

		mockMeta = {
			blockedHosts: [],
			requireSignedApFetch: false,
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ActivityPubAccessControlService,
				{ provide: DI.config, useValue: { host: 'test.example.com' } },
				{ provide: DI.meta, useValue: mockMeta },
				{ provide: DI.instancesRepository, useValue: mockInstancesRepository },
				{ provide: UtilityService, useValue: mockUtilityService },
				{ provide: ApDbResolverService, useValue: mockApDbResolverService },
				{
					provide: LoggerService, useValue: {
						getLogger: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() })),
					},
				},
			],
		}).compile();

		service = module.get<ActivityPubAccessControlService>(ActivityPubAccessControlService);
	});

	function signerOf(host: string, keyPem = 'PEM') {
		return { user: { host }, key: { keyPem } };
	}

	describe('checkAccess', () => {
		test('User-Agent が無ければ許可', async () => {
			expect(await service.checkAccess({ headers: {} } as FastifyRequest)).toBeNull();
		});

		test('ActivityPub 以外のリクエストは許可', async () => {
			expect(await service.checkAccess(uaRequest('Mozilla/5.0 (https://blocked.example.com)', undefined))).toBeNull();
		});

		test('制限の無いサーバーは許可', async () => {
			expect(await service.checkAccess(uaRequest('http.rb/5.3.0 (Mastodon/4.2.0; +https://mastodon.example.com/)'))).toBeNull();
			expect(await service.checkAccess(uaRequest('Pleroma 2.5.0; https://pleroma.example.com <team@pleroma.example.com>'))).toBeNull();
		});

		test('ブロックしたサーバーは拒否', async () => {
			mockUtilityService.isBlockedHost.mockReturnValue(true);
			expect(await service.checkAccess(uaRequest('http.rb/5.3.0 (Mastodon/4.2.0; +https://blocked.example.com/)'))).toEqual({
				blocked: true,
				reason: 'blocked',
				host: 'blocked.example.com',
			});
		});

		test('UA に tempura を含んでもブロックしたサーバーは拒否', async () => {
			mockUtilityService.isBlockedHost.mockReturnValue(true);
			const result = await service.checkAccess(uaRequest('Misskey/2026.10.0-tempura-2.0.20 (https://blocked.example.com)'));
			expect(result?.reason).toBe('blocked');
		});

		test('停止中のサーバーは拒否', async () => {
			mockInstancesRepository.findOneBy.mockResolvedValue({ suspensionState: 'goneSuspended', quarantineLimited: false });
			expect((await service.checkAccess(uaRequest('Misskey/13.0.0 (https://suspended.example.com/)')))?.reason).toBe('suspended');
		});

		test('隔離中のサーバーは allowLimitedHosts のときだけ許可', async () => {
			mockInstancesRepository.findOneBy.mockResolvedValue({ suspensionState: 'none', quarantineLimited: true });
			const req = uaRequest('http.rb/5.3.0 (Mastodon/4.2.0; +https://quarantined.example.com/)');
			expect((await service.checkAccess(req, false))?.reason).toBe('quarantined');
			expect(await service.checkAccess(req, true)).toBeNull();
		});

		test('自分自身からのリクエストは許可', async () => {
			mockUtilityService.isBlockedHost.mockReturnValue(true);
			expect(await service.checkAccess(uaRequest('Misskey/13.0.0 (https://test.example.com/)'))).toBeNull();
		});

		test('署名があれば UA より keyId のホストで判定する', async () => {
			mockUtilityService.isBlockedHost.mockImplementation((_: string[], host: string) => host === 'blocked.example.com');
			const result = await service.checkAccess(signedRequest('https://blocked.example.com/actor#main-key'));
			expect(result?.host).toBe('blocked.example.com');
		});

		describe('署名必須モード', () => {
			beforeEach(() => {
				mockMeta.requireSignedApFetch = true;
			});

			test('署名が無ければ拒否', async () => {
				expect((await service.checkAccess(uaRequest('Misskey/13.0.0 (https://remote.example.com/)')))?.reason).toBe('signatureRequired');
			});

			test('requireSignature が false のルートでは署名を求めない', async () => {
				expect(await service.checkAccess(uaRequest('Misskey/13.0.0 (https://remote.example.com/)'), true, false)).toBeNull();
			});

			test('検証できた署名は許可', async () => {
				mockApDbResolverService.getAuthUserFromKeyId.mockResolvedValue(signerOf('remote.example.com'));
				vi.mocked(httpSignature.verifySignature).mockReturnValue(true);
				expect(await service.checkAccess(signedRequest('https://remote.example.com/users/a#main-key'))).toBeNull();
			});

			test('鍵を知らなければアカウントを取得して検証する', async () => {
				mockApDbResolverService.getAuthUserFromApId.mockResolvedValue(signerOf('remote.example.com'));
				vi.mocked(httpSignature.verifySignature).mockReturnValue(true);
				expect(await service.checkAccess(signedRequest('https://remote.example.com/actor#main-key'))).toBeNull();
				expect(mockApDbResolverService.getAuthUserFromApId).toHaveBeenCalledWith('https://remote.example.com/actor');
			});

			test('署名の検証に失敗したら拒否', async () => {
				mockApDbResolverService.getAuthUserFromKeyId.mockResolvedValue(signerOf('remote.example.com'));
				vi.mocked(httpSignature.verifySignature).mockReturnValue(false);
				expect((await service.checkAccess(signedRequest('https://remote.example.com/users/a#main-key')))?.reason).toBe('signatureRequired');
			});

			test('ブロックしたサーバーのアカウントは取りに行かない', async () => {
				mockUtilityService.isFederationAllowedHost.mockReturnValue(false);
				expect((await service.checkAccess(signedRequest('https://blocked.example.com/actor#main-key')))?.reason).toBe('signatureRequired');
				expect(mockApDbResolverService.getAuthUserFromApId).not.toHaveBeenCalled();
			});
		});
	});

	describe('checkNoteAccess', () => {
		const includeNote = () => note({ mode: 'include', hosts: ['allowed.example.com'] });

		test('配送先の指定が無ければ許可', async () => {
			expect(await service.checkNoteAccess(note(null), uaRequest('Misskey/13.0.0 (https://remote.example.com/)'))).toBe(true);
		});

		test('include リストは UA で名乗っただけでは許可しない', async () => {
			expect(await service.checkNoteAccess(includeNote(), uaRequest('Misskey/13.0.0 (https://allowed.example.com/)'))).toBe(false);
		});

		test('include リストは署名を検証できたサーバーだけ許可', async () => {
			mockApDbResolverService.getAuthUserFromKeyId.mockResolvedValue(signerOf('allowed.example.com'));
			vi.mocked(httpSignature.verifySignature).mockReturnValue(true);
			expect(await service.checkNoteAccess(includeNote(), signedRequest('https://allowed.example.com/users/a#main-key'))).toBe(true);
		});

		test('include リストは署名者と keyId のホストが食い違えば拒否', async () => {
			mockApDbResolverService.getAuthUserFromKeyId.mockResolvedValue(signerOf('other.example.com'));
			vi.mocked(httpSignature.verifySignature).mockReturnValue(true);
			expect(await service.checkNoteAccess(includeNote(), signedRequest('https://allowed.example.com/users/a#main-key'))).toBe(false);
		});

		test('include リストに無いサーバーは署名が正しくても拒否', async () => {
			mockApDbResolverService.getAuthUserFromKeyId.mockResolvedValue(signerOf('other.example.com'));
			vi.mocked(httpSignature.verifySignature).mockReturnValue(true);
			expect(await service.checkNoteAccess(includeNote(), signedRequest('https://other.example.com/users/a#main-key'))).toBe(false);
		});

		test('exclude リストのサーバーは名乗っただけで拒否', async () => {
			const excludeNote = note({ mode: 'exclude', hosts: ['excluded.example.com'] });
			expect(await service.checkNoteAccess(excludeNote, uaRequest('Misskey/13.0.0 (https://excluded.example.com/)'))).toBe(false);
			expect(await service.checkNoteAccess(excludeNote, uaRequest('Misskey/13.0.0 (https://other.example.com/)'))).toBe(true);
		});
	});
});
