/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { prefer } from '@/preferences.js';
import { getRegionFromCoordinates, passesRegionFilter } from '@/utility/tempura-script/earthquake/region-filter.js';
import type { EarthquakeAlertData } from '@/utility/tempura-script/earthquake/types.js';

function setPref(key: string, value: unknown): void {
	(prefer.s as unknown as Record<string, unknown>)[key] = value;
}

function makeAlert(latitude: number, longitude: number): EarthquakeAlertData {
	return {
		type: 'jma_eew',
		Title: '',
		CodeType: '',
		Issue: { Source: '', Status: '' },
		EventID: 'test',
		Serial: '1',
		AnnouncedTime: '',
		OriginTime: '',
		Hypocenter: '',
		Latitude: latitude,
		Longitude: longitude,
		magnitude: 0,
		Depth: 0,
		MaxIntensity: '3',
		Accuracy: { Epicenter: '', Depth: '', Magnitude: '' },
		MaxIntChange: { String: '', Reason: '' },
		WarnArea: { Chiiki: '', Shindo1: '', Shindo2: '', Time: '', Type: '', Arrive: false },
		isSea: false,
		isTraining: false,
		isAssumption: false,
		isWarn: false,
		isFinal: false,
		isCancel: false,
		OriginalText: '',
	};
}

describe('earthquake/region-filter', () => {
	beforeEach(() => {
		setPref('enableEarthquakeWarningRegionFilter', false);
		setPref('earthquakeWarningRegionFilter', []);
	});

	describe('getRegionFromCoordinates', () => {
		it('緯度・経度から地域を判定する', () => {
			expect(getRegionFromCoordinates(43.0, 141.0)).toBe('hokkaido');
			expect(getRegionFromCoordinates(39.0, 140.0)).toBe('tohoku');
			expect(getRegionFromCoordinates(36.0, 139.7)).toBe('kanto');
			expect(getRegionFromCoordinates(36.0, 137.0)).toBe('chubu');
			expect(getRegionFromCoordinates(34.5, 135.5)).toBe('kinki');
			expect(getRegionFromCoordinates(34.5, 133.0)).toBe('chugoku');
			expect(getRegionFromCoordinates(33.0, 133.0)).toBe('shikoku');
			expect(getRegionFromCoordinates(31.0, 130.0)).toBe('kyushu');
		});
	});

	describe('passesRegionFilter', () => {
		it('フィルタが無効なら常に通す', () => {
			setPref('enableEarthquakeWarningRegionFilter', false);
			setPref('earthquakeWarningRegionFilter', ['kanto']);
			expect(passesRegionFilter(makeAlert(36.0, 139.7))).toBe(true);
		});

		it('選択地域が空なら常に通す', () => {
			setPref('enableEarthquakeWarningRegionFilter', true);
			setPref('earthquakeWarningRegionFilter', []);
			expect(passesRegionFilter(makeAlert(31.0, 130.0))).toBe(true);
		});

		it('選択地域に含まれていれば通す', () => {
			setPref('enableEarthquakeWarningRegionFilter', true);
			setPref('earthquakeWarningRegionFilter', ['kanto', 'tohoku']);
			expect(passesRegionFilter(makeAlert(36.0, 139.7))).toBe(true);
			expect(passesRegionFilter(makeAlert(39.0, 140.0))).toBe(true);
		});

		it('選択地域に含まれていなければ通さない', () => {
			setPref('enableEarthquakeWarningRegionFilter', true);
			setPref('earthquakeWarningRegionFilter', ['kanto']);
			expect(passesRegionFilter(makeAlert(31.0, 130.0))).toBe(false);
		});
	});
});
