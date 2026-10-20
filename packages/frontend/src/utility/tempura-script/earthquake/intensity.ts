/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { prefer } from '@/preferences.js';
import type { earthquakeSoundTypes } from '@/utility/sound.js';

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

/**
 * 震度の大小比較順
 */
export const intensityOrder = ['1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'];

/**
 * 震度を比較可能なインデックスに変換する (未知の震度は -1)
 */
export function getIntensityIndex(intensity: string): number {
	return intensityOrder.indexOf(intensity);
}

/**
 * Get the minimum intensity threshold from user settings
 * Default is 3 if not set
 */
export function getIntensityThreshold(): string {
	return prefer.s.earthquakeWarningIntensity || '3';
}

/**
 * Check if the intensity equals or exceeds the threshold set by the user
 * Returns true if intensity is equal to or greater than threshold
 */
export function intensityExceedsThreshold(intensity: string): boolean {
	if (!intensity) return false;

	const thresholdIndex = getIntensityIndex(getIntensityThreshold());
	const actualIndex = getIntensityIndex(intensity);

	// Using >= to include the threshold value itself
	return actualIndex >= thresholdIndex;
}

/**
 * 震度から適切な音声ファイルのタイプを決定
 */
export function getSoundTypeForIntensity(
	intensity: string,
	isWarning: boolean,
	isCancel: boolean,
): keyof typeof earthquakeSoundTypes {
	// キャンセル報の場合
	if (isCancel) {
		return 'EEW_CANCELED';
	}

	const soundType = prefer.s.earthquakeWarningSoundType || 'auto';

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
