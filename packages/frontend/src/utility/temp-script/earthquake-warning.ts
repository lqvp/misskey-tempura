/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { prefer } from '@/preferences.js';
import { toast } from '@/os.js';
import { i18n } from '@/i18n.js';
import { playEarthquakeSound } from '@/utility/sound.js';

/**
 * Interface for earthquake alert data from jma_eew WebSocket API
 */
interface EarthquakeAlertData {
	type: string; // jma_eew
	Title: string; // EEW发报报头
	CodeType: string; // EEW发报说明
	Issue: {
		Source: string; // EEW发报机构位置
		Status: string; // EEW发报状态
	};
	EventID: string; // EEW发报ID
	Serial: string; // EEW发报数
	AnnouncedTime: string; // EEW发报时间(UTC+9)
	OriginTime: string; // 发震时间(UTC+9)
	Hypocenter: string; // 震源地
	Latitude: number; // 震源地纬度
	Longitude: number; // 震源地经度
	magnitude: number; // 震级
	Depth: number; // 震源深度
	MaxIntensity: string; // 最大震度
	Accuracy: {
		Epicenter: string; // 震中精度说明
		Depth: string; // 深度精度说明
		Magnitude: string; // 震级精度说明
	};
	MaxIntChange: {
		String: string; // 最大震度变更说明
		Reason: string; // 最大震度变更原因
	};
	WarnArea: {
		Chiiki: string; // 警报区域
		Shindo1: string; // 区域最大震度
		Shindo2: string; // 区域最小震度
		Time: string; // 区域警报时间
		Type: string; // 区域发报类型，分为 "予報" 和 "警報"
		Arrive: boolean; // 区域地震波是否已到达
	};
	isSea: boolean; // 是否为海域地震
	isTraining: boolean; // 是否为训练报
	isAssumption: boolean; // 是否为推定震源（PLUM/レベル/IPF法）
	isWarn: boolean; // 是否为警报
	isFinal: boolean; // 是否为最终报
	isCancel: boolean; // 是否为取消报
	OriginalText: string; // JMA气象厅原电文
}

/**
 * Japanese Shindo scale to description mapping
 */
export const shindoMap: Record<string, string> = {
	'1': '1',
	'2': '2',
	'3': '3',
	'4': '4',
	'5-': '5弱',
	'5+': '5強',
	'6-': '6弱',
	'6+': '6強',
	'7': '7',
};

// Added common intensity order and helper function for robust comparisons
const intensityOrder = ['1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'];

function getIntensityIndex(intensity: string): number {
	return intensityOrder.indexOf(intensity);
}

// 震度から適切な音声ファイルのタイプを決定
function getSoundTypeForIntensity(intensity: string, isWarning: boolean, isCancel: boolean): keyof typeof import('@/utility/sound.js').earthquakeSoundTypes {
	// キャンセル報の場合
	if (isCancel) {
		return 'EEW_CANCELED';
	}

	const soundType = prefer.r.earthquakeWarningSoundType.value || 'auto';

	if (soundType === 'eew') {
		// EEW音のみ使用
		return isWarning && getIntensityIndex(intensity) >= getIntensityIndex('5-') ? 'EEW2' : 'EEW1';
	} else if (soundType === 'info') {
		// 情報音声のみ使用
		switch (intensity) {
			case '1': return 'INFO_1';
			case '2': return 'INFO_2';
			case '3': return 'INFO_3';
			case '4': return 'INFO_4';
			case '5-': return 'INFO_5_MINUS';
			case '5+': return 'INFO_5_PLUS';
			case '6-': return 'INFO_6_MINUS';
			case '6+': return 'INFO_6_PLUS';
			case '7': return 'INFO_7';
			default: return 'INFO_4';
		}
	} else {
		// 自動選択モード

		if (isWarning) {
			return getIntensityIndex(intensity) >= getIntensityIndex('5-') ? 'EEW2' : 'EEW1';
		}

		switch (intensity) {
			case '1': return 'INFO_1';
			case '2': return 'INFO_2';
			case '3': return 'INFO_3';
			case '4': return 'INFO_4';
			case '5-': return 'INFO_5_MINUS';
			case '5+': return 'INFO_5_PLUS';
			case '6-': return 'INFO_6_MINUS';
			case '6+': return 'INFO_6_PLUS';
			case '7': return 'INFO_7';
			default: {
				const intensityIndex = getIntensityIndex(intensity);
				if (intensityIndex >= 4) {
					return 'SHINDO2';
				} else if (intensityIndex >= 0) {
					return 'SHINDO1';
				} else {
					return 'SHINDO0';
				}
			}
		}
	}
}

let wsConnection: WebSocket | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;

/**
 * Get the minimum intensity threshold from user settings
 * Default is 3 if not set
 */
export function getIntensityThreshold(): string {
	return prefer.r.earthquakeWarningIntensity.value || '3';
}

/**
 * Check if the intensity equals or exceeds the threshold set by the user
 * Returns true if intensity is equal to or greater than threshold
 */
function intensityExceedsThreshold(intensity: string): boolean {
	if (!intensity) return false;

	const threshold = getIntensityThreshold();
	const thresholdIndex = getIntensityIndex(threshold);
	const actualIndex = getIntensityIndex(intensity);

	// Using >= to include the threshold value itself
	return actualIndex >= thresholdIndex;
}

/**
 * Format earthquake alert message for toast notification
 */
function formatAlertMessage(data: EarthquakeAlertData): string {
	const intensity = data.MaxIntensity ? (shindoMap[data.MaxIntensity] || data.MaxIntensity) : '不明';
	const location = data.Hypocenter || '場所不明';
	const depth = data.Depth ? `深さ${data.Depth}km` : '';
	const magnitude = data.magnitude ? `M${data.magnitude}` : '';

	// 通知スタイルに基づいて表示内容を変更
	const notificationStyle = prefer.r.earthquakeWarningNotificationStyle.value || 'standard';

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

// 最近通知した地震IDと時刻を保存するマップ
const recentAlerts = new Map<string, number>();

/**
 * 通知抑制: 同じ地震IDの通知を一定時間内にスキップする
 */
function isThrottled(eventId: string): boolean {
	if (!eventId) return false;

	const now = Date.now();
	const throttleTime = (prefer.r.earthquakeWarningThrottleTime.value || 60) * 1000; // 秒をミリ秒に変換
	const lastTime = recentAlerts.get(eventId);

	if (lastTime && (now - lastTime < throttleTime)) {
		// 前回の通知から設定時間以内なのでスキップ
		return true;
	}

	// 最新の通知時刻を記録
	recentAlerts.set(eventId, now);

	// マップのサイズを制限（古いエントリを削除）
	if (recentAlerts.size > 100) {
		const oldestKey = recentAlerts.keys().next().value;
		if (oldestKey !== undefined) {
			recentAlerts.delete(oldestKey);
		}
	}

	return false;
}

/**
 * 地域フィルタリング: 設定された地域に関する地震のみ通知する
 */
function passesRegionFilter(data: EarthquakeAlertData): boolean {
	// 地域フィルタリングが無効なら常に通過
	if (!prefer.r.enableEarthquakeWarningRegionFilter.value) {
		return true;
	}

	const selectedRegions = prefer.r.earthquakeWarningRegionFilter.value || [];

	// 何も選択されていない場合はすべての地域を通知
	if (selectedRegions.length === 0) {
		return true;
	}

	// 震源地の座標から該当地域を判定
	const region = getRegionFromCoordinates(data.Latitude, data.Longitude);

	// 選択された地域に含まれているか確認
	return selectedRegions.includes(region);
}

/**
 * 座標から日本の地域を判定
 * 簡易的な実装として、大まかな地域区分を使用
 */
function getRegionFromCoordinates(latitude: number, longitude: number): string {
	// 北海道: 北緯41.5度以上
	if (latitude >= 41.5) return 'hokkaido';

	// 東北: 北緯38.0～41.5度
	if (latitude >= 38.0) return 'tohoku';

	// 関東: 北緯35.0～38.0度、東経138.5度以東
	if (latitude >= 35.0 && latitude < 38.0 && longitude >= 138.5) return 'kanto';

	// 中部: 北緯35.0～38.0度、東経138.5度以西
	if (latitude >= 35.0 && latitude < 38.0 && longitude < 138.5) return 'chubu';

	// 近畿: 北緯33.5～35.0度、東経135.0度以東
	if (latitude >= 33.5 && latitude < 35.0 && longitude >= 135.0) return 'kinki';

	// 中国: 北緯33.5～35.0度、東経135.0度以西
	if (latitude >= 33.5 && latitude < 35.0 && longitude < 135.0) return 'chugoku';

	// 四国: 北緯32.0～33.5度
	if (latitude >= 32.0 && latitude < 33.5) return 'shikoku';

	// 九州・沖縄: 北緯32.0度以南
	return 'kyushu';
}

/**
 * Display a toast notification for earthquake alerts
 */
function showEarthquakeAlert(data: EarthquakeAlertData): void {
	try {
		// Log data processing if detailed logging is enabled
		const logLevel = prefer.r.earthquakeWarningLogLevel.value || 'none';
		if (logLevel === 'detailed') {
			addToDataLog('processed', new Date(), data);
		}

		if (!prefer.r.enableEarthquakeWarning.value) return;

		// Check if this alert exceeds the user's intensity threshold
		if (!intensityExceedsThreshold(data.MaxIntensity)) return;

		// 訓練報のスキップ設定
		if (data.isTraining && prefer.r.earthquakeWarningIgnoreTraining.value) return;

		// Check if this alert matches the region filter (if enabled)
		if (prefer.r.enableEarthquakeWarningRegionFilter.value && !passesRegionFilter(data)) return;

		// Check if this alert is being throttled (same event ID within throttle time)
		if (isThrottled(data.EventID)) return;

		// Format the alert message according to user settings
		const message = formatAlertMessage(data);
		const duration = prefer.r.earthquakeWarningToastDuration.value || 10000;

		// Play the appropriate earthquake alert sound
		if (prefer.r.earthquakeWarningSound.value) {
			try {
				const soundType = getSoundTypeForIntensity(data.MaxIntensity, data.isWarn, data.isCancel);
				playEarthquakeSound(soundType).catch(error => {
					console.error('Failed to play earthquake sound, falling back to legacy sound', error);
					// フォールバック
					try {
						// alertSound.pause();
						// alertSound.currentTime = 0;
						// alertSound.play().catch(error => console.error('Failed to play legacy alert sound:', error));
					} catch (error) {
						console.error('Error playing legacy alert sound:', error);
					}
				});
			} catch (error) {
				console.error('Error determining sound type:', error);
			}
		}

		// Display toast notification
		toast(message, {
			duration: duration,
		});

		// If text-to-speech is enabled, read the message aloud
		if (prefer.r.enableEarthquakeWarningTts.value) {
			speakAlert(message);
		}
	} catch (error) {
		console.error('Error processing earthquake alert:', error);

		// Add error to data log if logging is enabled
		const logLevel = prefer.r.earthquakeWarningLogLevel.value || 'none';
		if (logLevel === 'detailed') {
			addToDataLog('error', new Date(), { error: String(error), data });
		}
	}
}

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
	const intensityOrder = ['1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'];
	const currentIndex = intensityOrder.indexOf(getIntensityThreshold());
	if (currentIndex < intensityOrder.length - 1) {
		mockData.MaxIntensity = intensityOrder[currentIndex + 1];
	} else {
		mockData.MaxIntensity = '7';
	}

	// 少し遅延させてリアルな動作をシミュレート
	setTimeout(() => {
		// 通常の処理をバイパスして、テスト通知を直接表示
		const message = formatAlertMessage(mockData);
		const duration = prefer.r.earthquakeWarningToastDuration.value || 10000;

		// 通知音を鳴らす（設定有効時）
		if (prefer.r.earthquakeWarningSound.value) {
			const soundType = getSoundTypeForIntensity(mockData.MaxIntensity, mockData.isWarn, mockData.isCancel);
			playEarthquakeSound(soundType)
				.catch(error => {
					console.error('Failed to play earthquake sound, falling back to legacy sound', error);
					// フォールバック
					try {
						// alertSound.pause();
						// alertSound.currentTime = 0;
						// alertSound.play().catch(error => console.error('Failed to play legacy alert sound:', error));
					} catch (error) {
						console.error('Error playing legacy alert sound:', error);
					}
				});
		}

		// Log test data if logging is enabled
		const logLevel = prefer.r.earthquakeWarningLogLevel.value || 'none';
		if (logLevel === 'basic' || logLevel === 'detailed') {
			addToDataLog('received', new Date(), { ...mockData, isTest: true });
		}

		// トースト通知を表示
		toast(`[テスト] ${message}`, {
			duration: duration,
		});

		if (prefer.r.enableEarthquakeWarningTts.value) {
			speakAlert(`テスト、${message.replace(/\n/g, '、')}`);
		}
	}, 500);
}

/**
 * Use text-to-speech to read the alert message
 */
function speakAlert(message: string): void {
	try {
		// Cancel any ongoing speech
		window.speechSynthesis.cancel();

		const utterance = new SpeechSynthesisUtterance(message.replace(/\n/g, '、'));

		// Set language to Japanese
		utterance.lang = 'ja-JP';

		// Get speech rate from settings
		const rate = prefer.r.earthquakeWarningTtsRate.value || 1.0;
		utterance.rate = rate;

		// Speak with normal pitch but slightly lower for authority
		utterance.pitch = 0.9;

		window.speechSynthesis.speak(utterance);
	} catch (error) {
		console.error('Speech synthesis error:', error);
	}
}

/**
 * Connect to earthquake warning WebSocket API
 */
export function connectEarthquakeWarningWs(): void {
	if (!prefer.r.enableEarthquakeWarning.value) return;
	if (wsConnection) return;

	try {
		// Add connection attempt to log if logging is enabled
		addToConnectionLog('info', new Date(), 'Attempting to connect to earthquake warning service');

		wsConnection = new WebSocket('wss://ws-api.wolfx.jp/jma_eew');

		wsConnection.onopen = () => {
			console.log('Earthquake warning WebSocket connected');

			// Clear any reconnect timeout if it exists
			if (reconnectTimeout) {
				clearTimeout(reconnectTimeout);
				reconnectTimeout = null;
			}

			// Notify user of successful connection if notification setting is enabled
			if (prefer.r.earthquakeWarningConnectionNotify.value) {
				toast(i18n.ts._earthquakeWarning.connectionEstablished, {
					duration: 3000,
				});
			}
		};

		wsConnection.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data) as EarthquakeAlertData;

				// Log received data if detailed logging is enabled
				const logLevel = prefer.r.earthquakeWarningLogLevel.value || 'none';
				if (logLevel === 'detailed') {
					addToDataLog('received', new Date(), data);
				}

				// Process jma_eew events (including training if not filtered)
				if (data.type === 'jma_eew') {
					showEarthquakeAlert(data);
				}

				// Respond to heartbeat with ping
				if (data.type === 'heartbeat') {
					wsConnection?.send('ping');
				}
			} catch (error) {
				console.error('Error processing earthquake warning data:', error);
			}
		};

		wsConnection.onclose = (event) => {
			console.log('Earthquake warning WebSocket closed', event);
			wsConnection = null;

			// Notify user of connection closure if notification setting is enabled
			if (prefer.r.earthquakeWarningConnectionNotify.value) {
				toast(i18n.ts._earthquakeWarning.connectionClosed, {
					duration: 3000,
				});
			}

			// Attempt to reconnect after delay
			if (prefer.r.enableEarthquakeWarning.value && !reconnectTimeout) {
				const reconnectDelay = 5000; // 5秒後に再接続
				reconnectTimeout = setTimeout(() => {
					reconnectTimeout = null;
					connectEarthquakeWarningWs();
				}, reconnectDelay);

				// ユーザーに再接続を試みることを通知
				if (prefer.r.earthquakeWarningConnectionNotify.value) {
					toast(i18n.ts._earthquakeWarning.reconnecting, {
						duration: 3000,
					});
				}
			}
		};

		wsConnection.onerror = (error) => {
			console.error('Earthquake warning WebSocket error:', error);

			// Notify user of connection error if notification setting is enabled
			if (prefer.r.earthquakeWarningConnectionNotify.value) {
				toast(i18n.ts._earthquakeWarning.connectionError, {
					duration: 5000,
				});
			}

			// Add error to connection log if logging is enabled
			addToConnectionLog('error', new Date(), 'WebSocket connection error');

			wsConnection?.close();
		};
	} catch (error: any) {
		console.error('Failed to connect to earthquake warning WebSocket:', error);

		// Add error to connection log if logging is enabled
		addToConnectionLog('error', new Date(), `Connection failed: ${error.message}`);

		// Notify user of connection failure if notification setting is enabled
		if (prefer.r.earthquakeWarningConnectionNotify.value) {
			toast(i18n.ts._earthquakeWarning.connectionFailed, {
				duration: 5000,
			});
		}
	}
}

/**
 * Disconnect from earthquake warning WebSocket API
 */
export function disconnectEarthquakeWarningWs(): void {
	if (wsConnection) {
		wsConnection.close();
		wsConnection = null;
	}

	if (reconnectTimeout) {
		clearTimeout(reconnectTimeout);
		reconnectTimeout = null;
	}
}

/**
 * Initialize earthquake warning system based on user settings
 */
// Log data structures for connection and data events
interface ConnectionLogEntry {
	type: 'info' | 'error' | 'warning';
	timestamp: Date;
	message: string;
}

interface DataLogEntry {
	type: 'received' | 'processed' | 'error';
	timestamp: Date;
	data: any;
}

// In-memory logs (will be lost on page refresh)
let connectionLog: ConnectionLogEntry[] = [];
let dataLog: DataLogEntry[] = [];
const MAX_LOG_ENTRIES = 100; // 最大ログエントリー数

/**
 * Add entry to connection log
 */
function addToConnectionLog(type: 'info' | 'error' | 'warning', timestamp: Date, message: string): void {
	// Check if logging is enabled
	const logLevel = prefer.r.earthquakeWarningLogLevel.value || 'none';
	if (logLevel === 'none') return;

	// For basic level, only log errors
	if (logLevel === 'basic' && type !== 'error') return;

	// Log to console for easier debugging
	console.log(`[EarthquakeWarning] [${type}] ${message}`);

	// Add to log
	connectionLog.unshift({ type, timestamp, message });

	// Trim log to maximum size
	if (connectionLog.length > MAX_LOG_ENTRIES) {
		connectionLog = connectionLog.slice(0, MAX_LOG_ENTRIES);
	}
}

/**
 * Add entry to data log
 */
function addToDataLog(type: 'received' | 'processed' | 'error', timestamp: Date, data: any): void {
	// Check if data logging is enabled
	const logLevel = prefer.r.earthquakeWarningLogLevel.value || 'none';
	if (logLevel !== 'detailed') return;

	// Log to console for easier debugging
	console.log(`[EarthquakeWarning] [Data ${type}]`, data);

	// Add to log
	dataLog.unshift({ type, timestamp, data });

	// Trim log to maximum size
	if (dataLog.length > MAX_LOG_ENTRIES) {
		dataLog = dataLog.slice(0, MAX_LOG_ENTRIES);
	}
}

/**
 * Initialize logs
 */
function initializeLogs(): void {
	// Clear existing logs
	connectionLog = [];
	dataLog = [];

	// Log initialization
	addToConnectionLog('info', new Date(), 'Earthquake warning system initialized');
}

/**
 * Get connection log entries
 */
export function getConnectionLogs(): ConnectionLogEntry[] {
	return [...connectionLog];
}

/**
 * Get data log entries
 */
export function getDataLogs(): DataLogEntry[] {
	return [...dataLog];
}

/**
 * Clear all logs
 */
export function clearAllLogs(): void {
	connectionLog = [];
	dataLog = [];
	addToConnectionLog('info', new Date(), 'Logs cleared');
}

export function initEarthquakeWarning(): void {
	// Initialize logs
	initializeLogs();

	// Disconnect any existing connection first
	disconnectEarthquakeWarningWs();

	// Connect to WebSocket if the feature is enabled
	if (prefer.r.enableEarthquakeWarning.value) {
		connectEarthquakeWarningWs();
	}
}
