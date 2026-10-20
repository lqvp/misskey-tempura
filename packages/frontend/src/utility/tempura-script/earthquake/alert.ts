/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { prefer } from '@/preferences.js';
import { toast } from '@/os.js';
import { playEarthquakeSound } from '@/utility/sound.js';
import { formatAlertMessage } from './alert-format.js';
import { getSoundTypeForIntensity, intensityExceedsThreshold } from './intensity.js';
import { addToDataLog } from './logs.js';
import { passesRegionFilter } from './region-filter.js';
import { isThrottled } from './throttle.js';
import { speakAlert } from './tts.js';
import type { EarthquakeAlertData } from './types.js';

/**
 * Display a toast notification for earthquake alerts
 */
export function showEarthquakeAlert(data: EarthquakeAlertData): void {
	try {
		// Log data processing if detailed logging is enabled
		const logLevel = prefer.s.earthquakeWarningLogLevel || 'none';
		if (logLevel === 'detailed') {
			addToDataLog('processed', new Date(), data);
		}

		if (!prefer.s.enableEarthquakeWarning) return;

		// Check if this alert exceeds the user's intensity threshold
		if (!intensityExceedsThreshold(data.MaxIntensity)) return;

		// 訓練報のスキップ設定
		if (data.isTraining && prefer.s.earthquakeWarningIgnoreTraining) return;

		// Check if this alert matches the region filter (if enabled)
		if (prefer.s.enableEarthquakeWarningRegionFilter && !passesRegionFilter(data)) return;

		// --- 報告番号・最終報フィルタリング ---
		const filterMode = prefer.s.earthquakeWarningReportFilterMode || 'any';
		const nth = prefer.s.earthquakeWarningReportNumber;
		let pass = true;
		if (filterMode === 'nth') {
			pass = nth != null && Number(data.Serial) === Number(nth);
		} else if (filterMode === 'final') {
			pass = !!data.isFinal;
		} else if (filterMode === 'both') {
			pass = (nth != null && Number(data.Serial) === Number(nth)) || !!data.isFinal;
		}
		if (!pass) return;

		// Check if this alert is being throttled (same event ID within throttle time)
		if (isThrottled(data.EventID)) return;

		// Format the alert message according to user settings
		const message = formatAlertMessage(data);
		const duration = prefer.s.earthquakeWarningToastDuration || 10000;

		// Play the appropriate earthquake alert sound
		if (prefer.s.earthquakeWarningSound) {
			try {
				const soundType = getSoundTypeForIntensity(data.MaxIntensity, data.isWarn, data.isCancel);
				playEarthquakeSound(soundType).catch(error => {
					console.error('Failed to play earthquake sound, falling back to legacy sound', error);
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
		if (prefer.s.enableEarthquakeWarningTts) {
			speakAlert(message);
		}
	} catch (error) {
		console.error('Error processing earthquake alert:', error);

		// Add error to data log if logging is enabled
		const logLevel = prefer.s.earthquakeWarningLogLevel || 'none';
		if (logLevel === 'detailed') {
			addToDataLog('error', new Date(), { error: String(error), data });
		}
	}
}
