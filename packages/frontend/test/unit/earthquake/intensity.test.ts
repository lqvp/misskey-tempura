/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { prefer } from '@/preferences.js';
import {
	getIntensityIndex,
	getIntensityThreshold,
	getSoundTypeForIntensity,
	intensityExceedsThreshold,
	shindoMap,
} from '@/utility/tempura-script/earthquake/intensity.js';

function setPref(key: string, value: unknown): void {
	(prefer.s as unknown as Record<string, unknown>)[key] = value;
}

describe('earthquake/intensity', () => {
	beforeEach(() => {
		setPref('earthquakeWarningIntensity', '3');
		setPref('earthquakeWarningSoundType', 'auto');
	});

	describe('shindoMap', () => {
		it('震度を日本語表記に変換する', () => {
			expect(shindoMap['5-']).toBe('5弱');
			expect(shindoMap['5+']).toBe('5強');
			expect(shindoMap['6-']).toBe('6弱');
			expect(shindoMap['6+']).toBe('6強');
			expect(shindoMap['3']).toBe('3');
		});
	});

	describe('getIntensityIndex', () => {
		it('震度の強順にインデックスを返す', () => {
			expect(getIntensityIndex('1')).toBe(0);
			expect(getIntensityIndex('5-')).toBe(4);
			expect(getIntensityIndex('5+')).toBe(5);
			expect(getIntensityIndex('7')).toBe(8);
		});

		it('未知の震度は -1 を返す', () => {
			expect(getIntensityIndex('unknown')).toBe(-1);
			expect(getIntensityIndex('')).toBe(-1);
		});
	});

	describe('getIntensityThreshold', () => {
		it('設定値を返す', () => {
			setPref('earthquakeWarningIntensity', '5-');
			expect(getIntensityThreshold()).toBe('5-');
		});

		it('未設定の場合は 3 を返す', () => {
			setPref('earthquakeWarningIntensity', undefined);
			expect(getIntensityThreshold()).toBe('3');
		});
	});

	describe('intensityExceedsThreshold', () => {
		it('しきい値と等しい震度は true', () => {
			expect(intensityExceedsThreshold('3')).toBe(true);
		});

		it('しきい値より弱い震度は false', () => {
			expect(intensityExceedsThreshold('2')).toBe(false);
		});

		it('しきい値より強い震度は true', () => {
			expect(intensityExceedsThreshold('5-')).toBe(true);
		});

		it('空文字は false', () => {
			expect(intensityExceedsThreshold('')).toBe(false);
		});
	});

	describe('getSoundTypeForIntensity', () => {
		it('キャンセル報は EEW_CANCELED', () => {
			expect(getSoundTypeForIntensity('7', true, true)).toBe('EEW_CANCELED');
		});

		it('eew モードは警報強度で EEW1 / EEW2 を選ぶ', () => {
			setPref('earthquakeWarningSoundType', 'eew');
			expect(getSoundTypeForIntensity('3', true, false)).toBe('EEW1');
			expect(getSoundTypeForIntensity('5-', true, false)).toBe('EEW2');
			expect(getSoundTypeForIntensity('5-', false, false)).toBe('EEW1');
		});

		it('info モードは震度ごとの情報音声を返す', () => {
			setPref('earthquakeWarningSoundType', 'info');
			expect(getSoundTypeForIntensity('1', false, false)).toBe('INFO_1');
			expect(getSoundTypeForIntensity('4', false, false)).toBe('INFO_4');
			expect(getSoundTypeForIntensity('5-', false, false)).toBe('INFO_5_MINUS');
			expect(getSoundTypeForIntensity('7', false, false)).toBe('INFO_7');
		});

		it('自動選択モードは警報なら EEW1 / EEW2 を使う', () => {
			expect(getSoundTypeForIntensity('3', true, false)).toBe('EEW1');
			expect(getSoundTypeForIntensity('5+', true, false)).toBe('EEW2');
		});

		it('自動選択モードで警報でなければ情報音声を使う', () => {
			expect(getSoundTypeForIntensity('2', false, false)).toBe('INFO_2');
			expect(getSoundTypeForIntensity('6+', false, false)).toBe('INFO_6_PLUS');
		});

		it('未知の震度は SHINDO 系にフォールバックする', () => {
			expect(getSoundTypeForIntensity('unknown', false, false)).toBe('SHINDO0');
		});
	});
});
