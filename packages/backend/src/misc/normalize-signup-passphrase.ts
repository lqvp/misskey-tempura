/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

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
 * 入力が設定された合言葉と一致するかを判定する。
 * どちらかが空文字・null/undefined の場合は一致しない。
 */
export function isSignupPassphraseMatch(input: string | null | undefined, expected: string | null | undefined): boolean {
	if (input == null || expected == null) return false;
	const a = normalizeSignupPassphrase(input);
	const b = normalizeSignupPassphrase(expected);
	if (a.length === 0 || b.length === 0) return false;
	return a === b;
}
