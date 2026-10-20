/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { prefer } from '@/preferences.js';
import { toast } from '@/os.js';
import { playEarthquakeSound } from '@/utility/sound.js';
import { formatAlertMessage } from './alert-format.js';
import { getIntensityThreshold, getSoundTypeForIntensity, intensityOrder } from './intensity.js';
import { addToDataLog, initializeLogs } from './logs.js';
import { speakAlert } from './tts.js';
import { connectEarthquakeWarningWs, disconnectEarthquakeWarningWs } from './ws-client.js';
import type { EarthquakeAlertData } from './types.js';

/**
 * Test earthquake alert with mock data
 */
export function testEarthquakeAlert(): void {
	// モックデータの作成（日本の地震情報をシミュレート）
	const mockData: EarthquakeAlertData = {
		type: 'jma_eew',
		Title: '緊急地震速報（テスト）',
		CodeType: 'テスト',
		Issue: {
			Source: '気象庁',
			Status: 'テスト配信',
		},
		EventID: 'TEST12345',
		Serial: '1',
		AnnouncedTime: new Date().toISOString(),
		OriginTime: new Date().toISOString(),
		Hypocenter: 'テスト震源地',
		Latitude: 35.6895,
		Longitude: 139.6917,
		magnitude: 6.5,
		Depth: 10,
		MaxIntensity: getIntensityThreshold(), // ユーザー設定の震度をそのまま使用
		Accuracy: {
			Epicenter: 'テスト',
			Depth: 'テスト',
			Magnitude: 'テスト',
		},
		MaxIntChange: {
			String: '',
			Reason: '',
		},
		WarnArea: {
			Chiiki: 'テスト地域',
			Shindo1: getIntensityThreshold(),
			Shindo2: '1',
			Time: new Date().toISOString(),
			Type: '予報',
			Arrive: false,
		},
		isSea: false,
		isTraining: true, // テスト配信であることを示す
		isAssumption: false,
		isWarn: true,
		isFinal: false,
		isCancel: false,
		OriginalText: 'テスト配信用データ',
	};

	// 震度をユーザー設定+1にして確実に通知されるようにする(ただし震度7を超えないように)
	const currentIndex = intensityOrder.indexOf(getIntensityThreshold());
	if (currentIndex < intensityOrder.length - 1) {
		mockData.MaxIntensity = intensityOrder[currentIndex + 1];
	} else {
		mockData.MaxIntensity = '7';
	}

	// 少し遅延させてリアルな動作をシミュレート
	window.setTimeout(() => {
		// 通常の処理をバイパスして、テスト通知を直接表示
		const message = formatAlertMessage(mockData);
		const duration = prefer.s.earthquakeWarningToastDuration || 10000;

		// 通知音を鳴らす（設定有効時）
		if (prefer.s.earthquakeWarningSound) {
			const soundType = getSoundTypeForIntensity(mockData.MaxIntensity, mockData.isWarn, mockData.isCancel);
			playEarthquakeSound(soundType)
				.catch(error => {
					console.error('Failed to play earthquake sound, falling back to legacy sound', error);
				});
		}

		// Log test data if logging is enabled
		const logLevel = prefer.s.earthquakeWarningLogLevel || 'none';
		if (logLevel === 'basic' || logLevel === 'detailed') {
			addToDataLog('received', new Date(), { ...mockData, isTest: true });
		}

		// トースト通知を表示
		toast(`[テスト] ${message}`, {
			duration: duration,
		});

		if (prefer.s.enableEarthquakeWarningTts) {
			speakAlert(`テスト、${message.replace(/\n/g, '、')}`);
		}
	}, 500);
}

/**
 * Initialize earthquake warning system based on user settings
 */
export function initEarthquakeWarning(): void {
	// Initialize logs
	initializeLogs();

	// Disconnect any existing connection first
	disconnectEarthquakeWarningWs();

	// Connect to WebSocket if the feature is enabled
	if (prefer.s.enableEarthquakeWarning) {
		connectEarthquakeWarningWs();
	}
}

export type { ConnectionLogEntry, DataLogEntry, EarthquakeAlertData } from './types.js';
export { getIntensityThreshold, shindoMap } from './intensity.js';
export { clearAllLogs, getConnectionLogs, getDataLogs } from './logs.js';
export { connectEarthquakeWarningWs, disconnectEarthquakeWarningWs } from './ws-client.js';
