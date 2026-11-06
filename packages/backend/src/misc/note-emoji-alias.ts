/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * ノート用リモート絵文字参照 (エイリアス) 名の形式
 * (`re_` + safeName + `_` + 8..32桁の16進ダイジェスト)。
 * /emoji/ ルート・フロントエンド・ローカル絵文字名の予約判定で共通利用する。
 */
export const NOTE_EMOJI_ALIAS_REGEXP = /^re_[A-Za-z0-9_]+_[0-9a-f]{8,32}$/;
