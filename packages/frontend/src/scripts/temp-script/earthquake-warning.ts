/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defaultStore } from '@/store.js';
import { toast } from '@/os.js';
import { i18n } from '@/i18n.js';
import { playEarthquakeSound } from '@/scripts/sound.js';

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
	Magunitude: number; // 震级
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

// 震度から適切な音声ファイルのタイプを決定
function getSoundTypeForIntensity(intensity: string, isWarning: boolean, isCancel: boolean): keyof typeof import('@/scripts/sound.js').earthquakeSoundTypes {
	// キャンセル報の場合
	if (isCancel) {
		return 'EEW_CANCELED';
	}

	// 通知音タイプの設定に基づいて選択
	const soundType = defaultStore.reactiveState.earthquakeWarningSoundType?.value || 'auto';

	if (soundType === 'eew') {
		// EEW音のみ使用
		return isWarning && intensity >= '5-' ? 'EEW2' : 'EEW1';
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
			default: return 'INFO_4'; // デフォルト
		}
	} else {
		// 自動選択モード
		// 警報・予報の判定
		if (isWarning) {
			return intensity >= '5-' ? 'EEW2' : 'EEW1';
		}

		// 情報音声（震度別）
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
				// 震度に応じてアラート音を選択
				const intensityOrder = ['1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'];
				const intensityIndex = intensityOrder.indexOf(intensity);

				if (intensityIndex >= 4) { // 震度5弱以上
					return 'SHINDO2';
				} else if (intensityIndex >= 0) { // 震度1以上
					return 'SHINDO1';
				} else {
					return 'SHINDO0'; // 不明または微小地震
				}
			}
		}
	}
}

let wsConnection: WebSocket | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;

/**
 * Get the minimum intensity threshold from user settings
 * Default is 4 if not set
 */
export function getIntensityThreshold(): string {
	return defaultStore.reactiveState.earthquakeWarningIntensity.value || '4';
}

/**
 * Check if the intensity exceeds the threshold set by the user
 */
function intensityExceedsThreshold(intensity: string): boolean {
	if (!intensity) return false;

	const threshold = getIntensityThreshold();
	const intensityOrder = ['1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'];

	const thresholdIndex = intensityOrder.indexOf(threshold);
	const actualIndex = intensityOrder.indexOf(intensity);

	return actualIndex >= thresholdIndex;
}

/**
 * Format earthquake alert message for toast notification
 */
function formatAlertMessage(data: EarthquakeAlertData): string {
	const intensity = data.MaxIntensity ? (shindoMap[data.MaxIntensity] || data.MaxIntensity) : '不明';
	const location = data.Hypocenter || '場所不明';
	const depth = data.Depth ? `深さ${data.Depth}km` : '';
	const magnitude = data.Magunitude ? `M${data.Magunitude}` : '';

	// 通知スタイルに基づいて表示内容を変更
	const notificationStyle = defaultStore.reactiveState.earthquakeWarningNotificationStyle.value || 'standard';

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
	const throttleTime = (defaultStore.reactiveState.earthquakeWarningThrottleTime.value || 60) * 1000; // 秒をミリ秒に変換
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
	if (!defaultStore.reactiveState.enableEarthquakeWarningRegionFilter.value) {
		return true;
	}

	const selectedRegions = defaultStore.reactiveState.earthquakeWarningRegionFilter.value || [];

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
	if (!defaultStore.reactiveState.enableEarthquakeWarning.value) return;

	// Check if this alert exceeds the user's intensity threshold
	if (!intensityExceedsThreshold(data.MaxIntensity)) return;

	// 訓練報のスキップ設定
	if (data.isTraining && defaultStore.reactiveState.earthquakeWarningIgnoreTraining.value) return;

	// Check if this alert matches the region filter (if enabled)
	if (!passesRegionFilter(data)) return;

	// 通知抑制: 同じイベントIDの通知を一定時間スキップ
	if (isThrottled(data.EventID)) return;

	// Format the message for display
	const message = formatAlertMessage(data);

	// Set notification duration
	const duration = defaultStore.reactiveState.earthquakeWarningToastDuration.value || 10000;

	// Play alert sound if enabled
	if (defaultStore.reactiveState.earthquakeWarningSound.value) {
		const soundType = getSoundTypeForIntensity(data.MaxIntensity, data.isWarn, data.isCancel);
		playEarthquakeSound(soundType)
			.catch(error => {
				console.error('Failed to play earthquake sound, falling back to legacy sound', error);
				// フォールバック
				try {
					alertSound.pause();
					alertSound.currentTime = 0;
					alertSound.play().catch(error => console.error('Failed to play legacy alert sound:', error));
				} catch (error) {
					console.error('Error playing legacy alert sound:', error);
				}
			});
	}

	// Show toast notification
	toast(message, {
		duration: duration,
	});

	// If text-to-speech is enabled, read the message aloud
	if (defaultStore.reactiveState.enableEarthquakeWarningTts.value) {
		speakAlert(message);
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
		Magunitude: 6.5,
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
		const duration = defaultStore.reactiveState.earthquakeWarningToastDuration.value || 10000;

		// 通知音を鳴らす（設定有効時）
		if (defaultStore.reactiveState.earthquakeWarningSound.value) {
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

		// トースト通知を表示
		toast(`[テスト] ${message}`, {
			duration: duration,
		});

		if (defaultStore.reactiveState.enableEarthquakeWarningTts.value) {
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
		const rate = defaultStore.reactiveState.earthquakeWarningTtsRate.value || 1.0;
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
	if (!defaultStore.reactiveState.enableEarthquakeWarning.value) return;
	if (wsConnection) return;

	try {
		wsConnection = new WebSocket('wss://ws-api.wolfx.jp/jma_eew');

		wsConnection.onopen = () => {
			console.log('Earthquake warning WebSocket connected');

			// Clear any reconnect timeout if it exists
			if (reconnectTimeout) {
				clearTimeout(reconnectTimeout);
				reconnectTimeout = null;
			}
		};

		wsConnection.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data) as EarthquakeAlertData;

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

		wsConnection.onclose = () => {
			console.log('Earthquake warning WebSocket closed');
			wsConnection = null;

			// Attempt to reconnect after delay
			if (defaultStore.reactiveState.enableEarthquakeWarning.value && !reconnectTimeout) {
				reconnectTimeout = setTimeout(() => {
					reconnectTimeout = null;
					connectEarthquakeWarningWs();
				}, 5000);
			}
		};

		wsConnection.onerror = (error) => {
			console.error('Earthquake warning WebSocket error:', error);
			wsConnection?.close();
		};
	} catch (error) {
		console.error('Failed to connect to earthquake warning WebSocket:', error);
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
export function initEarthquakeWarning(): void {
	// Disconnect any existing connection first
	disconnectEarthquakeWarningWs();

	// Connect to WebSocket if the feature is enabled
	if (defaultStore.reactiveState.enableEarthquakeWarning.value) {
		connectEarthquakeWarningWs();
	}
}
