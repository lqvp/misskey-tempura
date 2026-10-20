/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { prefer } from '@/preferences.js';
import { shindoMap } from './intensity.js';
import type { EarthquakeAlertData } from './types.js';

/**
 * Format earthquake alert message for toast notification
 */
export function formatAlertMessage(data: EarthquakeAlertData): string {
	const intensity = data.MaxIntensity ? (shindoMap[data.MaxIntensity] || data.MaxIntensity) : '不明';
	const location = data.Hypocenter || '場所不明';
	const depth = data.Depth ? `深さ${data.Depth}km` : '';
	const magnitude = data.magnitude ? `M${data.magnitude}` : '';

	// 通知スタイルに基づいて表示内容を変更
	const notificationStyle = prefer.s.earthquakeWarningNotificationStyle || 'standard';

	if (notificationStyle === 'simple') {
		return `【地震速報】${location} 最大震度${intensity}`;
	} else if (notificationStyle === 'detailed') {
		const time = new Date(data.OriginTime).toLocaleTimeString('ja-JP');
		const isFinal = data.isFinal ? '(最終報)' : '';
		const isTraining = data.isTraining ? '【訓練】' : '';
		const isWarn = data.isWarn ? '【警報】' : '【予報】';

		return `${isTraining}${isWarn}${isFinal}\n地震発生時刻: ${time}\n震源地: ${location}\n${depth} ${magnitude}\n最大震度: ${intensity}`;
	} else {
		// standard
		return `【地震速報】\n震源地: ${location}\n${depth} ${magnitude}\n最大震度: ${intensity}`;
	}
}
