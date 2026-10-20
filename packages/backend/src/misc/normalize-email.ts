/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const GMAIL_DOMAINS = ['gmail.com', 'googlemail.com'];

/**
 * 同じ受信箱に届くメールアドレスを同一とみなすための比較用の形に揃える。
 * 大文字小文字を無視し、+ 以降の別名を落とし、Gmail ではドットも落とす。
 * 判定にだけ使い、保存や送信には元のアドレスを使うこと
 */
export function normalizeEmailForComparison(email: string): string {
	const at = email.lastIndexOf('@');
	if (at === -1) return email.toLowerCase();

	const local = email.slice(0, at).toLowerCase();
	let domain = email.slice(at + 1).toLowerCase();

	// "+tag@example.com" のように + で始まる場合は別名とみなさない
	let normalizedLocal = local.split('+')[0] || local;

	if (GMAIL_DOMAINS.includes(domain)) {
		domain = 'gmail.com';
		normalizedLocal = normalizedLocal.replaceAll('.', '');
	}

	return `${normalizedLocal}@${domain}`;
}

/**
 * normalizeEmailForComparison と同じ規則を SQL で書いたもの。column は信頼できる列名だけを渡すこと
 */
export function normalizedEmailSql(column: string): string {
	const local = `lower(split_part(${column}, '@', 1))`;
	const domain = `lower(split_part(${column}, '@', 2))`;
	const stripped = `COALESCE(NULLIF(split_part(${local}, '+', 1), ''), ${local})`;
	return `CASE WHEN ${domain} IN (${GMAIL_DOMAINS.map(d => `'${d}'`).join(', ')})
		THEN replace(${stripped}, '.', '') || '@gmail.com'
		ELSE ${stripped} || '@' || ${domain} END`;
}
