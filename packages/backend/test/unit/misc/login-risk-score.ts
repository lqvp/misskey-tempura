/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { calculateLoginRisk } from '@/misc/login-risk-score.js';
import type { LoginRiskSignals } from '@/misc/login-risk-score.js';

const T = { notify: 30, stepUp: 60 };

const base: LoginRiskSignals = {
	deviceKnown: true,
	countryKnown: true,
	asnKnown: true,
	prefixKnown: true,
	recentOtherCountry: false,
	tor: false,
	spamhausDrop: false,
	datacenter: false,
	vpn: false,
	accountFailuresLastHour: 0,
	ipSprayAccountsLastHour: 0,
	daysSinceLastSuccess: 0,
	isPrivileged: false,
	learning: false,
};

describe('calculateLoginRisk', () => {
	test('既知環境は allow / 0点', () => expect(calculateLoginRisk(base, T)).toEqual({ score: 0, level: 'allow', reasons: [] }));

	test('新しい国+新しい端末で stepUp', () => {
		const r = calculateLoginRisk({ ...base, deviceKnown: false, countryKnown: false, asnKnown: false }, T);
		expect(r.score).toBe(75);
		expect(r.level).toBe('stepUp');
		expect(r.reasons).toEqual(['newDevice', 'newCountry', 'newAsn']);
	});

	test('既知端末なら国/ASN/プレフィックスは半分', () => {
		expect(calculateLoginRisk({ ...base, countryKnown: false, asnKnown: false, prefixKnown: false }, T).score).toBe(26); // 15+8+3
	});

	test('端末トークン未発行(null)は加点しない', () => {
		expect(calculateLoginRisk({ ...base, deviceKnown: null }, T).score).toBe(0);
	});

	test('国が不明(null)は加点しない', () => {
		expect(calculateLoginRisk({ ...base, countryKnown: null, asnKnown: null }, T).score).toBe(0);
	});

	test('管理者は1.5倍', () => {
		expect(calculateLoginRisk({ ...base, tor: true, isPrivileged: true }, T).score).toBe(60);
	});

	test('学習期間中は notify が上限', () => {
		const r = calculateLoginRisk({ ...base, spamhausDrop: true, deviceKnown: false, learning: true }, T);
		expect(r.level).toBe('notify');
		expect(r.reasons).toContain('learning');
	});

	test('しきい値の境界', () => {
		expect(calculateLoginRisk({ ...base, deviceKnown: false }, T).level).toBe('notify'); // 30
		expect(calculateLoginRisk({ ...base, accountFailuresLastHour: 2 }, T).score).toBe(0);
		expect(calculateLoginRisk({ ...base, accountFailuresLastHour: 3 }, T).score).toBe(15);
		expect(calculateLoginRisk({ ...base, ipSprayAccountsLastHour: 5 }, T).score).toBe(30);
		expect(calculateLoginRisk({ ...base, daysSinceLastSuccess: 60 }, T).score).toBe(10);
		expect(calculateLoginRisk({ ...base, daysSinceLastSuccess: 59 }, T).score).toBe(0);
	});
});
