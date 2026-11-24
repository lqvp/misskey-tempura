/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeAll, afterAll, describe, expect, test } from 'vitest';
import { DataSource, type Repository } from 'typeorm';
import { initTestDb } from '../../utils.js';
import { MiUser } from '@/models/User.js';
import { rewriteUserMediaProxyUrls } from '@/misc/rewrite-user-media-proxy-urls.js';

const OLD = 'https://old-proxy.example/proxy';
const NEW = 'https://new-proxy.example/proxy';

describe('rewriteUserMediaProxyUrls', () => {
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

	test('旧接頭辞のプロキシ URL を新接頭辞へ書き換える (avatar + banner)', async () => {
		const user = await insertUser({
			avatarUrl: `${OLD}/avatar.webp?url=https%3A%2F%2Fremote.example%2Fa.png&avatar=1`,
			bannerUrl: `${OLD}/image.webp?url=https%3A%2F%2Fremote.example%2Fb.png`,
		});

		const count = await rewriteUserMediaProxyUrls(usersRepository as any, OLD, NEW);

		expect(count).toBe(2);
		const after = await usersRepository.findOneByOrFail({ id: user.id });
		expect(after.avatarUrl).toBe(`${NEW}/avatar.webp?url=https%3A%2F%2Fremote.example%2Fa.png&avatar=1`);
		expect(after.bannerUrl).toBe(`${NEW}/image.webp?url=https%3A%2F%2Fremote.example%2Fb.png`);
	});

	test('プロキシ URL でない URL・他プロキシ・origin= 付き・null は書き換えない', async () => {
		const plain = await insertUser({
			avatarUrl: 'https://cdn.example/files/abc.png',
			bannerUrl: `${OLD}/files/abc.png`, // ?url= を含まないので対象外
		});
		const other = await insertUser({
			avatarUrl: 'https://other-proxy.example/proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Fa.png',
		});
		const origin = await insertUser({
			avatarUrl: `${OLD}/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&origin=1`,
		});
		const empty = await insertUser({ avatarUrl: null, bannerUrl: null });

		const count = await rewriteUserMediaProxyUrls(usersRepository as any, OLD, NEW);

		expect(count).toBe(0);
		for (const u of [plain, other, origin, empty]) {
			const after = await usersRepository.findOneByOrFail({ id: u.id });
			expect(after.avatarUrl).toBe(u.avatarUrl);
			expect(after.bannerUrl).toBe(u.bannerUrl);
		}
	});

	test('書き換え後に列上限を超える行はスキップする (avatar 1024 / banner 512)', async () => {
		// 新接頭辞は旧接頭辞より delta 文字長い
		const longNew = `https://new-proxy.example/${'p'.repeat(60)}`;
		const delta = longNew.length - OLD.length;
		const avatarBase = `${OLD}/avatar.webp?url=`;
		const bannerBase = `${OLD}/image.webp?url=`;
		const pad = (base: string, total: number): string => base + 'x'.repeat(total - base.length);

		// 書き換え前は列上限以内、書き換え後はちょうど上限 (fits) / 上限超え (overflow)
		const fits = await insertUser({
			avatarUrl: pad(avatarBase, 1024 - delta),
			bannerUrl: pad(bannerBase, 512 - delta),
		});
		const overflow = await insertUser({
			avatarUrl: pad(avatarBase, 1024 - delta + 1),
			bannerUrl: pad(bannerBase, 512 - delta + 1),
		});

		const count = await rewriteUserMediaProxyUrls(usersRepository as any, OLD, longNew);

		expect(count).toBe(2);
		const fitsAfter = await usersRepository.findOneByOrFail({ id: fits.id });
		expect(fitsAfter.avatarUrl!.startsWith(`${longNew}/`)).toBe(true);
		expect(fitsAfter.avatarUrl!.length).toBe(1024);
		expect(fitsAfter.bannerUrl!.startsWith(`${longNew}/`)).toBe(true);
		expect(fitsAfter.bannerUrl!.length).toBe(512);
		const overflowAfter = await usersRepository.findOneByOrFail({ id: overflow.id });
		expect(overflowAfter.avatarUrl).toBe(overflow.avatarUrl);
		expect(overflowAfter.bannerUrl).toBe(overflow.bannerUrl);
	});

	test('SQL インジェクション耐性: 接頭辞はパラメータバインドされる', async () => {
		const user = await insertUser({
			avatarUrl: `${OLD}/avatar.webp?url=https%3A%2F%2Fremote.example%2Fa.png`,
		});
		const malicious = `https://new.example/proxy'; DROP TABLE "user"; --`;

		const count = await rewriteUserMediaProxyUrls(usersRepository as any, OLD, malicious);

		expect(count).toBe(1);
		const after = await usersRepository.findOneByOrFail({ id: user.id });
		expect(after.avatarUrl!.startsWith(`${malicious}/`)).toBe(true);
	});
});