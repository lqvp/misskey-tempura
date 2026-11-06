/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export function isRetentionShortening(previous: number, next: number): boolean {
	return next !== 0 && (previous === 0 || next < previous);
}
export function retentionBoundary(now: Date, months: number): string {
	const index = Math.max(12, now.getUTCFullYear() * 12 + now.getUTCMonth() - months + 1);
	return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}-01`;
}
export function formatUsageNumber(value: string | null): string {
	return value === null ? '—' : BigInt(value).toLocaleString('ja-JP');
}
export function chartTokenValue(value: string | null): number | null {
	if (value === null) return null;
	const n = Number(value);
	return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
