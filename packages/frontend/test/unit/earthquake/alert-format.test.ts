/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { prefer } from '@/preferences.js';
import { formatAlertMessage } from '@/utility/tempura-script/earthquake/alert-format.js';
import type { EarthquakeAlertData } from '@/utility/tempura-script/earthquake/types.js';

function setPref(key: string, value: unknown): void {
	(prefer.s as unknown as Record<string, unknown>)[key] = value;
}

function makeAlert(overrides: Partial<EarthquakeAlertData> = {}): EarthquakeAlertData {
	return {
		type: 'jma_eew',
		Title: '',
		CodeType: '',
		Issue: { Source: '', Status: '' },
		EventID: 'test',
		Serial: '1',
		AnnouncedTime: '',
		OriginTime: '2026-01-01T00:00:00+09:00',
		Hypocenter: '東京都',
		Latitude: 36.0,
		Longitude: 139.7,
		magnitude: 6.5,
		Depth: 10,
		MaxIntensity: '5+',
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
		...overrides,
	};
}

describe('earthquake/alert-format', () => {
	beforeEach(() => {
		setPref('earthquakeWarningNotificationStyle', 'standard');
	});

	it('標準スタイルは震源地・深さ・マグニチュード・最大震度を表示する', () => {
		const message = formatAlertMessage(makeAlert());
		expect(message).toContain('【地震速報】');
		expect(message).toContain('震源地: 東京都');
		expect(message).toContain('深さ10km');
		expect(message).toContain('M6.5');
		expect(message).toContain('最大震度: 5強');
	});

	it('シンプルスタイルは1行にまとめる', () => {
		setPref('earthquakeWarningNotificationStyle', 'simple');
		const message = formatAlertMessage(makeAlert());
		expect(message).toBe('【地震速報】東京都 最大震度5強');
	});

	it('詳細スタイルは発生時刻と種別を含む', () => {
		setPref('earthquakeWarningNotificationStyle', 'detailed');
		const message = formatAlertMessage(makeAlert({ isWarn: true, isFinal: true }));
		expect(message).toContain('【警報】');
		expect(message).toContain('(最終報)');
		expect(message).toContain('地震発生時刻:');
		expect(message).toContain('震源地: 東京都');
	});

	it('訓練報は訓練であることを示す', () => {
		setPref('earthquakeWarningNotificationStyle', 'detailed');
		const message = formatAlertMessage(makeAlert({ isTraining: true }));
		expect(message).toContain('【訓練】');
	});

	it('震源地が不明な場合は既定値を入れる', () => {
		const message = formatAlertMessage(makeAlert({ Hypocenter: '', Depth: 0, magnitude: 0 }));
		expect(message).toContain('場所不明');
	});

	it('未知の震度はそのまま表示する', () => {
		const message = formatAlertMessage(makeAlert({ MaxIntensity: 'unknown' }));
		expect(message).toContain('最大震度: unknown');
	});
});
