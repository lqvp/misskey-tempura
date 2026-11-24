/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Repository } from 'typeorm';
import type { MiUser } from '@/models/User.js';

/** MiUser.avatarUrl の列長 (packages/backend/src/models/User.ts) */
export const USER_AVATAR_URL_MAX_LENGTH = 1024;
/** MiUser.bannerUrl の列長 (packages/backend/src/models/User.ts) */
export const USER_BANNER_URL_MAX_LENGTH = 512;

/**
 * メディアプロキシが生成する URL の接頭辞を取り出す正規表現。
 * `<proxy>/<mode>.webp?url=...` 形式のみを対象にし、`?url=` を持たない素のファイル URL を誤って書き換えない。
 * プロキシがルート直下で配信する構成 (パスなし) にも対応する。
 */
const PROXY_PREFIX_PATTERN = '^(https?://[^/]+(?:/[^?]*)?)/(?:image|static|avatar|preview|emoji|svg)\\.(?:webp|png)\\?(?=\\S*url=)';

export interface ReconcileMediaProxyResult {
	/** 書き換えた行数 (avatar + banner) */
	rewritten: number;
	/** origin= を要求しているためスキップした行数 */
	skippedByOrigin: number;
	/** 列長上限を超えるためスキップした行数 */
	skippedByLength: number;
	/** 対象外のプロキシ接頭辞のまま残っている行数 (fromMediaProxy 指定時のみ意味を持つ) */
	remainingForeignProxy: number;
}

export interface ReconcileMediaProxyOptions {
	/**
	 * 書き換え対象をこの接頭辞の行だけに限定する (設定変更時は旧値が分かるので、無関係な配信元 URL を巻き込まない)。
	 * 省略した場合は「プロキシ形式の URL すべて」が対象になる (明示的な再同期用)。
	 */
	fromMediaProxy?: string | null;
}

/** $3 (旧接頭辞) が指定されているときだけ、対象をその接頭辞配下に限定する */
function sourceFilterSql(column: 'avatarUrl' | 'bannerUrl', hasFromPrefix: boolean): string {
	if (!hasFromPrefix) return '';
	return `AND left("${column}", char_length($3)) = $3`;
}

function countSql(column: 'avatarUrl' | 'bannerUrl', maxLength: number, hasFromPrefix: boolean): string {
	// スコープ判定は FILTER 側に置く (WHERE に置くと「スコープ外の残存」を数えられなくなる)
	const scoped = hasFromPrefix ? `AND left("${column}", char_length($3)) = $3` : '';
	const unsettled = `AND left("${column}", char_length($3)) <> $3`;
	return `
		SELECT
			${hasFromPrefix ? `count(*) FILTER (
				WHERE substring("${column}" FROM $2) IS NOT NULL
					AND substring("${column}" FROM $2) <> $1
					${unsettled}
			)::int` : '0::int'} AS remaining_foreign,
			count(*) FILTER (
				WHERE strpos("${column}", 'origin=') > 0
					${scoped}
			)::int AS blocked_origin,
			count(*) FILTER (
				WHERE strpos("${column}", 'origin=') = 0
					AND char_length($1) + char_length("${column}") - char_length(substring("${column}" FROM $2)) > ${maxLength}
					${scoped}
			)::int AS blocked_length
		FROM "user"
		WHERE "${column}" IS NOT NULL
			AND (strpos("${column}", '?url=') > 0 OR strpos("${column}", '&url=') > 0)
			AND substring("${column}" FROM $2) IS NOT NULL
			AND substring("${column}" FROM $2) <> $1`;
}

function updateSql(column: 'avatarUrl' | 'bannerUrl', maxLength: number, hasFromPrefix: boolean): string {
	return `
		UPDATE "user"
		SET "${column}" = $1 || substring("${column}" FROM char_length(substring("${column}" FROM $2)) + 1)
		WHERE "${column}" IS NOT NULL
			AND (strpos("${column}", '?url=') > 0 OR strpos("${column}", '&url=') > 0)
			AND substring("${column}" FROM $2) IS NOT NULL
			AND substring("${column}" FROM $2) <> $1
			AND strpos("${column}", 'origin=') = 0
			AND char_length($1) + char_length("${column}") - char_length(substring("${column}" FROM $2)) <= ${maxLength}
			${sourceFilterSql(column, hasFromPrefix)}`;
}

/**
 * DB に保存済みの avatarUrl / bannerUrl を、指定したメディアプロキシのベース URL へ収束させる。
 *
 * 「旧→新」のペアではなく「現在のプロキシへ寄せる」冪等な操作にしてあるため、
 * - 同じ値で再実行しても結果が変わらない (リトライ・再保存による復旧が可能)
 * - 途中で失敗して古い接頭辞が残っても、次回の実行で回収できる
 *
 * avatar と banner の更新は 1 トランザクションで実行し、advisory lock でクラスタ全体を直列化する。
 * `?url=` を含むメディアプロキシ URL だけを対象にし、`origin=` 付きはオリジン配信が必須なので触らない。
 */
export async function reconcileUserMediaProxyUrls(
	usersRepository: Repository<MiUser>,
	toMediaProxy: string,
	options: ReconcileMediaProxyOptions = {},
): Promise<ReconcileMediaProxyResult> {
	const targetPrefix = toMediaProxy.replace(/\/+$/, '');
	const fromPrefix = options.fromMediaProxy != null && options.fromMediaProxy.trim() !== ''
		? options.fromMediaProxy.trim().replace(/\/+$/, '')
		: null;
	const hasFromPrefix = fromPrefix != null;
	const params: [string, string] | [string, string, string] = hasFromPrefix
		? [targetPrefix, PROXY_PREFIX_PATTERN, `${fromPrefix}/`]
		: [targetPrefix, PROXY_PREFIX_PATTERN];

	return await usersRepository.manager.transaction(async (entityManager) => {
		// クラスタ構成でも書き換えが交錯しないよう、トランザクション内で advisory lock を取る
		await entityManager.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['misskey:mediaProxyRewrite']);

		const avatarCounts = await entityManager.query(
			countSql('avatarUrl', USER_AVATAR_URL_MAX_LENGTH, hasFromPrefix),
			params,
		) as { blocked_origin: number; blocked_length: number; remaining_foreign: number; }[];
		const bannerCounts = await entityManager.query(
			countSql('bannerUrl', USER_BANNER_URL_MAX_LENGTH, hasFromPrefix),
			params,
		) as { blocked_origin: number; blocked_length: number; remaining_foreign: number; }[];

		const [, avatarRewritten] = await entityManager.query(
			updateSql('avatarUrl', USER_AVATAR_URL_MAX_LENGTH, hasFromPrefix),
			params,
		) as [unknown[], number];
		const [, bannerRewritten] = await entityManager.query(
			updateSql('bannerUrl', USER_BANNER_URL_MAX_LENGTH, hasFromPrefix),
			params,
		) as [unknown[], number];

		return {
			rewritten: avatarRewritten + bannerRewritten,
			skippedByOrigin: (avatarCounts[0]?.blocked_origin ?? 0) + (bannerCounts[0]?.blocked_origin ?? 0),
			skippedByLength: (avatarCounts[0]?.blocked_length ?? 0) + (bannerCounts[0]?.blocked_length ?? 0),
			remainingForeignProxy: (avatarCounts[0]?.remaining_foreign ?? 0) + (bannerCounts[0]?.remaining_foreign ?? 0),
		};
	});
}
