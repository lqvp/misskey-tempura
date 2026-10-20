/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 地震速報警告機能のエントリポイント。
 *
 * 実装は `./earthquake/` 以下のモジュールに分割されている:
 * - `types.ts`        : 型定義
 * - `intensity.ts`    : 震度の比較と通知音の選択
 * - `throttle.ts`     : 同一地震IDの通知抑制
 * - `region-filter.ts`: 地域フィルタ
 * - `alert-format.ts` : 通知メッセージの整形
 * - `tts.ts`          : 読み上げ
 * - `logs.ts`         : 接続/データログ
 * - `alert.ts`        : 通知の組み立て
 * - `ws-client.ts`    : WebSocket 接続と再接続
 */
export * from './earthquake/index.js';
