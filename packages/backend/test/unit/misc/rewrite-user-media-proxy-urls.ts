/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeAll, afterAll, describe, expect, test } from 'vitest';
import { DataSource, type Repository } from 'typeorm';
import { initTestDb } from '../../utils.js';
import { MiUser } from '@/models/User.js';
import {
	pickStorableProfileImageUrl,
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

	test('origin=1 以外の origin 指定 (origin=0 など) は通常のプロキシ URL として移行する', async () => {
		const user = await insertUser({
			avatarUrl: 'https://old-proxy.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&origin=0',
			bannerUrl: 'https://old-proxy.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fb.png&origin=10',
		});

		const result = await reconcileUserMediaProxyUrls(usersRepository, NEXT);

		expect(result.rewritten).toBe(2);
		expect(result.skippedByOrigin).toBe(0);
		const after = await usersRepository.findOneByOrFail({ id: user.id });
		expect(after.avatarUrl).toBe(`${NEXT}/image.webp?url=https%3A%2F%2Fremote.example%2Fa.png&origin=0`);
		expect(after.bannerUrl).toBe(`${NEXT}/image.webp?url=https%3A%2F%2Fremote.example%2Fb.png&origin=10`);
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

	test('ルート直下で配信する旧プロキシからも移行できる (パスなし接頭辞)', async () => {
		const user = await insertUser({
			avatarUrl: 'https://root-proxy.example/avatar.webp?url=https%3A%2F%2Fremote.example%2Fa.png&avatar=1',
			bannerUrl: 'https://root-proxy.example/image.webp?url=https%3A%2F%2Fremote.example%2Fb.png',
		});

		const result = await reconcileUserMediaProxyUrls(usersRepository, NEXT);

		expect(result.rewritten).toBe(2);
		const after = await usersRepository.findOneByOrFail({ id: user.id });
		expect(after.avatarUrl).toBe(`${NEXT}/avatar.webp?url=https%3A%2F%2Fremote.example%2Fa.png&avatar=1`);
		expect(after.bannerUrl).toBe(`${NEXT}/image.webp?url=https%3A%2F%2Fremote.example%2Fb.png`);
	});

	test('fromMediaProxy 指定時はその接頭辞の行だけを書き換える (無関係な配信元 URL を巻き込まない)', async () => {
		const target = await insertUser({
			avatarUrl: 'https://old-a.example/proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Fa.png&avatar=1',
		});
		const other = await insertUser({
			// 別のプロキシ (移行対象外) と、外部配信元の ?url= 付き URL (誤爆してはいけない)
			avatarUrl: 'https://old-b.example/proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Fb.png&avatar=1',
			bannerUrl: 'https://cdn.example/image.webp?url=https%3A%2F%2Fremote.example%2Fc.png',
		});

		const result = await reconcileUserMediaProxyUrls(usersRepository, NEXT, { fromMediaProxy: 'https://old-a.example/proxy' });

		expect(result.rewritten).toBe(1);
		const targetAfter = await usersRepository.findOneByOrFail({ id: target.id });
		expect(targetAfter.avatarUrl).toBe(`${NEXT}/avatar.webp?url=https%3A%2F%2Fremote.example%2Fa.png&avatar=1`);
		const otherAfter = await usersRepository.findOneByOrFail({ id: other.id });
		expect(otherAfter.avatarUrl).toBe(other.avatarUrl);
		expect(otherAfter.bannerUrl).toBe(other.bannerUrl);
	});

	test('スコープ付き実行で残った別プロキシの行を remainingForeignProxy として数える', async () => {
		const scoped = await insertUser({
			avatarUrl: 'https://old-a.example/proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Fa.png&avatar=1',
		});
		const leftover = await insertUser({
			avatarUrl: 'https://stale.example/proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Fb.png&avatar=1',
		});

		const result = await reconcileUserMediaProxyUrls(usersRepository, NEXT, { fromMediaProxy: 'https://old-a.example/proxy' });

		expect(result.rewritten).toBe(1);
		expect(result.remainingForeignProxy).toBe(1);
		const leftoverAfter = await usersRepository.findOneByOrFail({ id: leftover.id });
		expect(leftoverAfter.avatarUrl).toBe(leftover.avatarUrl);
		const scopedAfter = await usersRepository.findOneByOrFail({ id: scoped.id });
		expect(scopedAfter.avatarUrl!.startsWith(`${NEXT}/`)).toBe(true);
	});

	test('スコープなし再同期は他のプロキシ接頭辞も対象に含める (明示的な復旧操作)', async () => {
		const leftover = await insertUser({
			avatarUrl: 'https://stale.example/proxy/avatar.webp?url=https%3A%2F%2Fremote.example%2Fb.png&avatar=1',
		});

		const result = await reconcileUserMediaProxyUrls(usersRepository, NEXT);

		expect(result.rewritten).toBe(1);
		expect(result.remainingForeignProxy).toBe(0);
		const after = await usersRepository.findOneByOrFail({ id: leftover.id });
		expect(after.avatarUrl!.startsWith(`${NEXT}/`)).toBe(true);
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

describe('pickStorableProfileImageUrl', () => {
	const proxied = 'https://proxy.example/proxy/image.webp?url=https%3A%2F%2Fremote.example%2Fb.png';

	test('列長上限内なら公開URLをそのまま使う', () => {
		expect(pickStorableProfileImageUrl({ isLink: true, url: 'https://remote.example/b.png', webpublicUrl: null }, proxied, 512)).toBe(proxied);
	});

	test('上限超過時、ローカル保存済みのファイルは自サーバーの配信URLで代替する', () => {
		const file = { isLink: false, url: 'https://server.example/files/abc', webpublicUrl: 'https://server.example/files/webpublic-abc' };
		expect(pickStorableProfileImageUrl(file, proxied, 10)).toBe(null);
		expect(pickStorableProfileImageUrl(file, proxied, 50)).toBe('https://server.example/files/webpublic-abc');
		expect(pickStorableProfileImageUrl({ ...file, webpublicUrl: null }, proxied, 50)).toBe('https://server.example/files/abc');
	});

	test('上限超過時、リンク形式のファイルは配信元 URL を返さず null にする', () => {
		expect(pickStorableProfileImageUrl({ isLink: true, url: 'https://remote.example/b.png', webpublicUrl: null }, proxied, 50)).toBe(null);
	});
});
