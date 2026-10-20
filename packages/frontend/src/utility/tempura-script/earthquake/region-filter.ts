/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { prefer } from '@/preferences.js';
import type { EarthquakeAlertData } from './types.js';

/**
 * 地域フィルタリング: 設定された地域に関する地震のみ通知する
 */
export function passesRegionFilter(data: EarthquakeAlertData): boolean {
	// 地域フィルタリングが無効なら常に通過
	if (!prefer.s.enableEarthquakeWarningRegionFilter) {
		return true;
	}

	const selectedRegions = prefer.s.earthquakeWarningRegionFilter || [];

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
export function getRegionFromCoordinates(latitude: number, longitude: number): string {
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
