/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const loginRiskReasons = ['newDevice', 'newCountry', 'newAsn', 'newPrefix', 'recentOtherCountry', 'tor', 'spamhausDrop', 'datacenter', 'vpn', 'accountFailures', 'ipSpray', 'dormant', 'learning', 'untrustedIp'] as const;
export type LoginRiskReason = typeof loginRiskReasons[number];
export type LoginRiskLevel = 'allow' | 'notify' | 'stepUp';

export type LoginRiskSignals = {
	deviceKnown: boolean | null;
	countryKnown: boolean | null;
	asnKnown: boolean | null;
	prefixKnown: boolean | null;
	recentOtherCountry: boolean;
	tor: boolean;
	spamhausDrop: boolean;
	datacenter: boolean;
	vpn: boolean;
	accountFailuresLastHour: number;
	ipSprayAccountsLastHour: number;
	daysSinceLastSuccess: number | null;
	isPrivileged: boolean;
	learning: boolean;
};

export type LoginRiskResult = { score: number; level: LoginRiskLevel; reasons: LoginRiskReason[] };

/**
 * ログインのリスク点数とレベルを計算する(純粋関数)。
 * reasons の順序は loginRiskReasons に従う。
 */
export function calculateLoginRisk(s: LoginRiskSignals, t: { notify: number; stepUp: number }): LoginRiskResult {
	const points: Partial<Record<LoginRiskReason, number>> = {};

	// 既知端末なら、場所に関する加点は半分にする
	const locationScale = s.deviceKnown === true ? 0.5 : 1;

	if (s.deviceKnown === false) points.newDevice = 30;
	if (s.countryKnown === false) points.newCountry = Math.round(30 * locationScale);
	if (s.asnKnown === false) points.newAsn = Math.round(15 * locationScale);
	if (s.prefixKnown === false) points.newPrefix = Math.round(5 * locationScale);
	if (s.recentOtherCountry) points.recentOtherCountry = 20;
	if (s.tor) points.tor = 40;
	if (s.spamhausDrop) points.spamhausDrop = 60;
	if (s.datacenter) points.datacenter = 20;
	if (s.vpn) points.vpn = 15;
	if (s.accountFailuresLastHour >= 3) points.accountFailures = 15;
	if (s.ipSprayAccountsLastHour >= 5) points.ipSpray = 30;
	if (s.daysSinceLastSuccess != null && s.daysSinceLastSuccess >= 60) points.dormant = 10;

	const reasons = loginRiskReasons.filter(r => (points[r] ?? 0) > 0);
	let score = reasons.reduce((sum, r) => sum + (points[r] ?? 0), 0);
	if (s.isPrivileged) score = Math.round(score * 1.5);

	let level: LoginRiskLevel = score >= t.stepUp ? 'stepUp' : score >= t.notify ? 'notify' : 'allow';

	if (s.learning) {
		if (level === 'stepUp') level = 'notify';
		reasons.push('learning');
	}

	return { score, level, reasons };
}
