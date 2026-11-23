/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * 登録用の合言葉を比較のために正規化する。
 *
 * 利用者が合言葉を手入力する前提なので、入力の揺れを吸収する:
 * - Unicode 正規化 (NFKC) で全角/半角・互換文字を揃える
 * - 前後の空白を落とし、単語間の連続する空白は 1 つのスペースにする
 * - 大文字小文字は区別しない
 *
 * 固定招待コード (fixedInviteCode) はコードとして扱うため
 * この正規化を併用せず厳密一致で比較すること。
 */
export function normalizeSignupPassphrase(input: string): string {
	return input.normalize('NFKC')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

/**
 * 2 つの文字列の秘密比較をタイミング非依存 (timing-safe) に行う。
 *
 * JavaScript の === は先頭から不一致文字で短絡するため、秘密の共有先頭長に
 * 応じた処理時間差が生じる。SHA-256 ダイジェスト同士を timingSafeEqual で
 * 比較することで、比較時間を入力の内容に依存させない。
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
	const da = createHash('sha256').update(a, 'utf8').digest();
	const db = createHash('sha256').update(b, 'utf8').digest();
	return timingSafeEqual(da, db);
}

/**
 * 入力が設定された合言葉と一致するかを判定する。
 * どちらかが空文字・null/undefined の場合は一致しない。
 */
export function isSignupPassphraseMatch(input: string | null | undefined, expected: string | null | undefined): boolean {
	// /signup は Fastify のスキーマ検証を通らない生ルートのため、
	// 実行時に文字列以外が渡ってくることを考慮する
	if (typeof input !== 'string' || typeof expected !== 'string') return false;
	const a = normalizeSignupPassphrase(input);
	const b = normalizeSignupPassphrase(expected);
	if (a.length === 0 || b.length === 0) return false;
	return timingSafeStringEqual(a, b);
}
