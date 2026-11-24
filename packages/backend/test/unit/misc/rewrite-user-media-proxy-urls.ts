/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeAll, afterAll, describe, expect, test } from 'vitest';
import { DataSource, type Repository } from 'typeorm';
import { initTestDb } from '../../utils.js';
import { MiUser } from '@/models/User.js';
import {
	reconcileUserMediaProxyUrls,
	USER_AVATAR_URL_MAX_LENGTH,
	USER_BANNER_URL_MAX_LENGTH,
} from '@/misc/rewrite-user-media-proxy-urls.js';

const NEXT = 'https://new-proxy.example/proxy';

describe('reconcileUserMediaProxyUrls', () => {
	let db: DataSource;
	let usersRepository: Repository<MiUser>;
	let seq = 0;

	beforeAll(async () => {
		db = await initTestDb(false);
		usersRepository = db.getRepository(MiUser);
	});

	afterEach(async () => {
		await usersRepository.createQueryBuilder().delete().execute();
	});

	afterAll(async () => {
		await db.destroy();
	});

	async function insertUser(partial: Partial<MiUser>): Promise<MiUser> {
		seq += 1;
		const id = `rwmp${String(seq).padStart(4, '0')}`;
		await usersRepository.insert({
			id,
			username: `user${seq}`,
			usernameLower: `user${seq}`,
			host: 'remote.example',
			...partial,
		});
		return await usersRepository.findOneByOrFail({ id });
	}

	test('任意の旧プロキシ接頭辞を現在のプロキシへ収束させる (avatar + banner)', async () => {
		const user = await insertUser({
			avatarUrl: 'https://old-proxy.example/proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Fa.png&avatar=1',
			bannerUrl: 'https://another-proxy.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fb.png',
		});

		const result = await reconcileUserMediaProxyUrls(usersRepository, NEXT);

		expect(result.rewritten).toBe(2);
		expect(result.skippedByOrigin).toBe(0);
		expect(result.skippedByLength).toBe(0);
		const after = await usersRepository.findOneByOrFail({ id: user.id });
		expect(after.avatarUrl).toBe(`${NEXT}/avatar.webp?url=https%3A%2F%2Fremote.example%2Fa.png&avatar=1`);
		expect(after.bannerUrl).toBe(`${NEXT}/image.webp?url=https%3A%2F%2Fremote.example%2Fb.png`);
	});

	test('冪等: 同じ値で 2 回実行しても件数 0 で URL は変化しない', async () => {
		const user = await insertUser({
			avatarUrl: 'https://old-proxy.example/proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Fa.png&avatar=1',
		});

		const first = await reconcileUserMediaProxyUrls(usersRepository, NEXT);
		expect(first.rewritten).toBe(1);
		const afterFirst = await usersRepository.findOneByOrFail({ id: user.id });

		const second = await reconcileUserMediaProxyUrls(usersRepository, NEXT);
		expect(second.rewritten).toBe(0);
		const afterSecond = await usersRepository.findOneByOrFail({ id: user.id });
		expect(afterSecond.avatarUrl).toBe(afterFirst.avatarUrl);
	});

	test('新接頭辞が旧接頭辞の配下でも二重前置しない', async () => {
		const user = await insertUser({
			avatarUrl: `${NEXT}/nested/avatar.webp?url=https%3A%2F%2Fremote.example%2Fa.png&avatar=1`,
		});

		// NEXT → NEXT/nested は「旧接頭辞の配下へ移す」操作。既に移行済みの行を二重前置しない
		const result = await reconcileUserMediaProxyUrls(usersRepository, `${NEXT}/nested`);

		expect(result.rewritten).toBe(0);
		const after = await usersRepository.findOneByOrFail({ id: user.id });
		expect(after.avatarUrl).toBe(`${NEXT}/nested/avatar.webp?url=https%3A%2F%2Fremote.example%2Fa.png&avatar=1`);
	});

	test('?url= を持たない素のファイル URL・非プロキシ URL・null は書き換えない', async () => {
		const plain = await insertUser({
			avatarUrl: 'https://cdn.example/files/abc.png',
			bannerUrl: 'https://cdn.example/files/banner.png',
		});
		const localDrive = await insertUser({
			avatarUrl: 'https://server.example/files/abc-123',
		});
		const empty = await insertUser({ avatarUrl: null, bannerUrl: null });

		const result = await reconcileUserMediaProxyUrls(usersRepository, NEXT);

		expect(result.rewritten).toBe(0);
		for (const u of [plain, localDrive, empty]) {
			const after = await usersRepository.findOneByOrFail({ id: u.id });
			expect(after.avatarUrl).toBe(u.avatarUrl);
			expect(after.bannerUrl).toBe(u.bannerUrl);
		}
	});

	test('origin= 付きは常に対象外として数える', async () => {
		const user = await insertUser({
			avatarUrl: 'https://old-proxy.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&origin=1',
		});

		const result = await reconcileUserMediaProxyUrls(usersRepository, NEXT);

		expect(result.rewritten).toBe(0);
		expect(result.skippedByOrigin).toBe(1);
		const after = await usersRepository.findOneByOrFail({ id: user.id });
		expect(after.avatarUrl).toBe(user.avatarUrl);
	});

	test('列長上限を超える行はスキップし、件数として数える (avatar 1024 / banner 512)', async () => {
		const longProxy = `https://new-proxy.example/${'p'.repeat(200)}`;
		const base = 'https://old-proxy.example/proxy/avatar.webp?url=';
		const bannerBase = 'https://old-proxy.example/proxy/image.webp?url=';
		const pad = (b: string, total: number) => b + 'x'.repeat(total - b.length);

		const overflow = await insertUser({
			avatarUrl: pad(base, USER_AVATAR_URL_MAX_LENGTH - 10),
			bannerUrl: pad(bannerBase, USER_BANNER_URL_MAX_LENGTH - 10),
		});
		const fits = await insertUser({
			avatarUrl: pad(base, base.length + 10),
			bannerUrl: pad(bannerBase, bannerBase.length + 10),
		});

		const result = await reconcileUserMediaProxyUrls(usersRepository, longProxy);

		expect(result.rewritten).toBe(2); // fits の avatar + banner
		expect(result.skippedByLength).toBe(2); // overflow の avatar + banner
		const overflowAfter = await usersRepository.findOneByOrFail({ id: overflow.id });
		expect(overflowAfter.avatarUrl).toBe(overflow.avatarUrl);
		expect(overflowAfter.bannerUrl).toBe(overflow.bannerUrl);
		const fitsAfter = await usersRepository.findOneByOrFail({ id: fits.id });
		expect(fitsAfter.avatarUrl!.startsWith(`${longProxy}/`)).toBe(true);
		expect(fitsAfter.bannerUrl!.startsWith(`${longProxy}/`)).toBe(true);
	});

	test('SQL インジェクション耐性: 接頭辞はパラメータバインドされる', async () => {
		const user = await insertUser({
			avatarUrl: 'https://old-proxy.example/proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Fa.png',
		});
		const malicious = `https://new.example/proxy'; DROP TABLE "user"; --`;

		const result = await reconcileUserMediaProxyUrls(usersRepository, malicious);

		expect(result.rewritten).toBe(1);
		const after = await usersRepository.findOneByOrFail({ id: user.id });
		expect(after.avatarUrl!.startsWith(`${malicious}/`)).toBe(true);
	});
});
