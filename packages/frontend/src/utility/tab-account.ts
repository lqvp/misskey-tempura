/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function selectTabAccount(url: string, accounts: [string, { id: string }][], host: string): string | null {
	const params = new URL(url).searchParams;
	let id: string | null;
	if (params.has('as')) id = params.get('as');
	else if (params.has('loginId')) id = params.get('loginId');
	else id = accounts.find(([h]) => h === host)?.[1].id ?? null;
	if (id !== null && (!id || !accounts.some(([h, user]) => h === host && user.id === id))) {
		throw new Error('The account selected by this URL is not saved on this device.');
	}
	return id;
}

export function accountUrl(path: string, id: string | null, base = window.location.href): string {
	const url = new URL(path, base);
	if (url.origin !== new URL(base).origin) return url.href;
	if (!url.searchParams.has('as')) {
		const selected = url.searchParams.get('loginId') ?? id;
		if (selected !== null) url.searchParams.set('as', selected);
	}
	url.searchParams.delete('loginId');
	return url.href;
}

// A shared content link must not carry this device's account selection.
export function sharedUrl(path: string, base = window.location.href): string {
	const url = new URL(path, base);
	if (url.origin !== new URL(base).origin) return url.href;
	url.searchParams.delete('as');
	url.searchParams.delete('loginId');
	return url.href;
}
