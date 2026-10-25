/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * OIDC プロバイダーの issuerUrl を保存前に検証する。
 * ログイン時の discovery (openid-client) は new URL() で解釈でき、かつ https のものしか受け付けないため、
 * 保存時点でそれ以外を拒否する (保存できてもログインボタンだけが出て失敗する状態を防ぐ)。
 * 認証を緩める方向の変更ではない。
 */
export function assertValidOidcIssuerUrl(issuerUrl: string): void {
	let url: URL;
	try {
		url = new URL(issuerUrl.trim());
	} catch {
		throw new Error('issuerUrl must be a valid URL');
	}
	if (url.protocol !== 'https:') {
		throw new Error('issuerUrl must be an https URL');
	}
	if (url.username !== '' || url.password !== '') {
		throw new Error('issuerUrl must not contain credentials');
	}
	// OIDC Discovery 1.0: issuer identifier に query と fragment は含められない (空の ? や # も含めて拒否)
	if (url.search !== '' || url.hash !== '' || issuerUrl.includes('?') || issuerUrl.includes('#')) {
		throw new Error('issuerUrl must not contain a query or fragment');
	}
}
