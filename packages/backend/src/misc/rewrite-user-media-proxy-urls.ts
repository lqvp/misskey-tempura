/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { UsersRepository } from '@/models/_.js';

/**
 * DB に保存済みの avatarUrl / bannerUrl のうち、旧メディアプロキシ接頭辞で始まる
 * プロキシ URL を新接頭辞へ書き換える。書き換えた行数 (avatar + banner) を返す。
 *
 * - `?url=` / `&url=` を含むものだけを対象にし、自サーバーの素のファイル URL を誤爆しない
 * - `origin=` を含む URL はオリジン配信が必須なので書き換えない
 * - 書き換え後の長さが列上限 (avatarUrl 1024 / bannerUrl 512) を超える行はスキップする
 */
export async function rewriteUserMediaProxyUrls(
	usersRepository: UsersRepository,
	oldMediaProxy: string,
	newMediaProxy: string,
): Promise<number> {
	const oldPrefix = `${oldMediaProxy}/`;
	const newPrefix = `${newMediaProxy}/`;

	// TypeORM (postgres) は UPDATE の query() で [rows, rowCount] を返す
	const [, avatarCount] = await usersRepository.query(
		`UPDATE "user"
		SET "avatarUrl" = $2 || substring("avatarUrl" FROM char_length($1) + 1)
		WHERE "avatarUrl" IS NOT NULL
			AND left("avatarUrl", char_length($1)) = $1
			AND (strpos("avatarUrl", '?url=') > 0 OR strpos("avatarUrl", '&url=') > 0)
			AND strpos("avatarUrl", 'origin=') = 0
			AND char_length($2) + char_length("avatarUrl") - char_length($1) <= 1024`,
		[oldPrefix, newPrefix],
	) as [unknown[], number];
	const [, bannerCount] = await usersRepository.query(
		`UPDATE "user"
		SET "bannerUrl" = $2 || substring("bannerUrl" FROM char_length($1) + 1)
		WHERE "bannerUrl" IS NOT NULL
			AND left("bannerUrl", char_length($1)) = $1
			AND (strpos("bannerUrl", '?url=') > 0 OR strpos("bannerUrl", '&url=') > 0)
			AND strpos("bannerUrl", 'origin=') = 0
			AND char_length($2) + char_length("bannerUrl") - char_length($1) <= 512`,
		[oldPrefix, newPrefix],
	) as [unknown[], number];

	return avatarCount + bannerCount;
}
