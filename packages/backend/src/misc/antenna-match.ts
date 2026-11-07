/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * アンテナのマッチ理由。どのキーワードグループにマッチしたかを保持する。
 * 永続化はせず、受信時のストリーム同梱と表示時の再計算に使う。
 */
export interface AntennaMatchInfo {
	/** マッチしたキーワードグループ(通常モード: マッチしたOR行 / SCOREモード: 加算されたグループ) */
	matchedKeywords: string[][];
	/** マッチした除外キーワードグループ(SCOREモードで減算されたグループ。通常モードではマッチ時点で除外されるため空) */
	matchedExcludeKeywords: string[][];
}
