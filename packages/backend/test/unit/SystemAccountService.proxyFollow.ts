/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { mockDeep } from 'vitest-mock-extended';
import type { FollowingsRepository, MiMeta } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import { GlobalModule } from '@/GlobalModule.js';
import { DI } from '@/di-symbols.js';

describe('SystemAccountService.shouldProxyFollow', () => {
	let app: TestingModule;
	let systemAccountService: SystemAccountService;
	let meta: MiMeta;
	let followingsRepository: FollowingsRepository;

	const target = { id: 'remote-user-id' } as MiUser;

	function mockLocalFollowExists(exists: boolean) {
		const queryBuilder = {
			where: vi.fn().mockReturnThis(),
			andWhere: vi.fn().mockReturnThis(),
			getExists: vi.fn().mockResolvedValue(exists),
		};
		(followingsRepository.createQueryBuilder as any).mockReturnValue(queryBuilder);
		return queryBuilder;
	}

	beforeAll(async () => {
		app = await Test.createTestingModule({
			imports: [
				GlobalModule,
			],
			providers: [
				SystemAccountService,
			],
		})
			.overrideProvider(DI.followingsRepository)
			.useValue(mockDeep<FollowingsRepository>())
			.useMocker((token) => {
				if (typeof token === 'function') {
					return mockDeep<typeof token>();
				}
			})
			.compile();

		app.enableShutdownHooks();

		systemAccountService = app.get<SystemAccountService>(SystemAccountService);
		meta = app.get<MiMeta>(DI.meta);
		followingsRepository = app.get<FollowingsRepository>(DI.followingsRepository);
	});

	afterAll(async () => {
		await app.close();
	});

	test('always: ローカルフォロワーがいてもフォローする', async () => {
		meta.proxyAccountFollowMode = 'always';
		mockLocalFollowExists(true);

		expect(await systemAccountService.shouldProxyFollow(target)).toBe(true);
	});

	test('always: フォロー状況を問わずDBを参照しない', async () => {
		meta.proxyAccountFollowMode = 'always';
		(followingsRepository.createQueryBuilder as any).mockClear();

		await systemAccountService.shouldProxyFollow(target);
		expect(followingsRepository.createQueryBuilder).not.toHaveBeenCalled();
	});

	test('disabled: 常にフォローしない', async () => {
		meta.proxyAccountFollowMode = 'disabled';
		mockLocalFollowExists(false);

		expect(await systemAccountService.shouldProxyFollow(target)).toBe(false);
		expect(followingsRepository.createQueryBuilder).not.toHaveBeenCalled();
	});

	test('skipIfFollowed: ローカルフォロワーがいればフォローしない', async () => {
		meta.proxyAccountFollowMode = 'skipIfFollowed';
		mockLocalFollowExists(true);

		expect(await systemAccountService.shouldProxyFollow(target)).toBe(false);
	});

	test('skipIfFollowed: ローカルフォロワーがいなければフォローする', async () => {
		meta.proxyAccountFollowMode = 'skipIfFollowed';
		mockLocalFollowExists(false);

		expect(await systemAccountService.shouldProxyFollow(target)).toBe(true);
	});
});
