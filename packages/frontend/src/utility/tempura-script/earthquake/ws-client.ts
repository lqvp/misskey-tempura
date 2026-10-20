/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { prefer } from '@/preferences.js';
import { toast } from '@/os.js';
import { i18n } from '@/i18n.js';
import { showEarthquakeAlert } from './alert.js';
import { addToConnectionLog, addToDataLog } from './logs.js';
import type { EarthquakeAlertData } from './types.js';

let wsConnection: WebSocket | null = null;
let reconnectTimeout: number | null = null;
let reconnectAttemptCount = 0;
let reconnectCooldownUntil = 0;
let lastReconnectNotifyAt = 0;

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 5000;
const RECONNECT_MAX_DELAY_MS = 60_000;
const RECONNECT_COOLDOWN_MS = 60 * 60 * 1000; // 1時間
const RECONNECT_NOTIFY_COOLDOWN_MS = 60_000; // 通知の連打防止

function scheduleEarthquakeWarningReconnect(): void {
	if (!prefer.s.enableEarthquakeWarning) return;
	if (reconnectTimeout) return;

	const now = Date.now();
	if (now < reconnectCooldownUntil) return;

	if (reconnectAttemptCount >= MAX_RECONNECT_ATTEMPTS) {
		reconnectCooldownUntil = now + RECONNECT_COOLDOWN_MS;
		reconnectAttemptCount = 0;
		addToConnectionLog('warning', new Date(), `Reconnect suspended for ${Math.round(RECONNECT_COOLDOWN_MS / 1000)}s after ${MAX_RECONNECT_ATTEMPTS} attempts`);

		if (prefer.s.earthquakeWarningConnectionNotify) {
			toast(i18n.ts._earthquakeWarning.connectionFailed, {
				duration: 5000,
			});
		}
		return;
	}

	reconnectAttemptCount += 1;
	const delay = Math.min(RECONNECT_BASE_DELAY_MS * (2 ** (reconnectAttemptCount - 1)), RECONNECT_MAX_DELAY_MS);

	addToConnectionLog('info', new Date(), `Scheduling reconnect attempt ${reconnectAttemptCount}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);

	reconnectTimeout = window.setTimeout(() => {
		reconnectTimeout = null;
		connectEarthquakeWarningWs();
	}, delay);

	if (prefer.s.earthquakeWarningConnectionNotify && (now - lastReconnectNotifyAt >= RECONNECT_NOTIFY_COOLDOWN_MS)) {
		lastReconnectNotifyAt = now;
		toast(i18n.ts._earthquakeWarning.reconnecting, {
			duration: 3000,
		});
	}
}

/**
 * Connect to earthquake warning WebSocket API
 */
export function connectEarthquakeWarningWs(): void {
	if (!prefer.s.enableEarthquakeWarning) return;
	if (wsConnection) return;

	try {
		// Add connection attempt to log if logging is enabled
		addToConnectionLog('info', new Date(), 'Attempting to connect to earthquake warning service');

		wsConnection = new WebSocket('wss://ws-api.wolfx.jp/jma_eew');

		wsConnection.onopen = () => {
			console.debug('Earthquake warning WebSocket connected');

			// Clear any reconnect timeout if it exists
			if (reconnectTimeout) {
				window.clearTimeout(reconnectTimeout);
				reconnectTimeout = null;
			}
			reconnectAttemptCount = 0;
			reconnectCooldownUntil = 0;
			lastReconnectNotifyAt = 0;

			// Notify user of successful connection if notification setting is enabled
			if (prefer.s.earthquakeWarningConnectionNotify) {
				toast(i18n.ts._earthquakeWarning.connectionEstablished, {
					duration: 3000,
				});
			}
		};

		wsConnection.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data) as EarthquakeAlertData;

				// Log received data if detailed logging is enabled
				const logLevel = prefer.s.earthquakeWarningLogLevel || 'none';
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
			console.debug('Earthquake warning WebSocket closed', event);
			wsConnection = null;

			// Notify user of connection closure if notification setting is enabled
			if (prefer.s.earthquakeWarningConnectionNotify) {
				toast(i18n.ts._earthquakeWarning.connectionClosed, {
					duration: 3000,
				});
			}

			scheduleEarthquakeWarningReconnect();
		};

		wsConnection.onerror = (error) => {
			console.error('Earthquake warning WebSocket error:', error);

			// Notify user of connection error if notification setting is enabled
			if (prefer.s.earthquakeWarningConnectionNotify) {
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
		if (prefer.s.earthquakeWarningConnectionNotify) {
			toast(i18n.ts._earthquakeWarning.connectionFailed, {
				duration: 5000,
			});
		}

		// WebSocket生成自体が失敗した場合も、一定回数だけリトライしてクールダウンする
		scheduleEarthquakeWarningReconnect();
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
		window.clearTimeout(reconnectTimeout);
		reconnectTimeout = null;
	}

	reconnectAttemptCount = 0;
	reconnectCooldownUntil = 0;
	lastReconnectNotifyAt = 0;
}
