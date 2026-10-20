/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { prefer } from '@/preferences.js';

// 最近通知した地震IDと時刻を保存するマップ
const recentAlerts = new Map<string, number>();

// マップの最大サイズ (古いエントリを削除する)
const MAX_RECENT_ALERTS = 100;

/**
 * 通知抑制: 同じ地震IDの通知を一定時間内にスキップする
 */
export function isThrottled(eventId: string): boolean {
	if (!eventId) return false;

	const now = Date.now();
	const throttleTime = (prefer.s.earthquakeWarningThrottleTime || 60) * 1000; // 秒をミリ秒に変換
	const lastTime = recentAlerts.get(eventId);

	if (lastTime && (now - lastTime < throttleTime)) {
		// 前回の通知から設定時間以内なのでスキップ
		return true;
	}

	// 最新の通知時刻を記録
	recentAlerts.set(eventId, now);

	// TTL 経過したエントリを掃除 (無制限成長を防ぐ)
	for (const [key, timestamp] of recentAlerts) {
		if (now - timestamp >= throttleTime) {
			recentAlerts.delete(key);
		}
	}

	// マップのサイズを制限（古いエントリを削除）
	if (recentAlerts.size > MAX_RECENT_ALERTS) {
		const oldestKey = recentAlerts.keys().next().value;
		if (oldestKey !== undefined) {
			recentAlerts.delete(oldestKey);
		}
	}

	return false;
}

/**
 * テスト用: 抑制状態を初期化する
 */
export function resetThrottleState(): void {
	recentAlerts.clear();
}
