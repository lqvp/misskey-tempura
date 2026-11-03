/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// タブごとのアカウント選択(?as=userId)の純粋なロジック。ブラウザAPIには触れない。

const ID_PATTERN = /^[A-Za-z0-9]{1,64}$/;

export type AccountParam =
	| { kind: 'absent' }
	| { kind: 'ok'; id: string }
	| { kind: 'invalid' };

export function parseAccountParam(search: string, name: 'as' | 'loginId'): AccountParam {
	const values = new URLSearchParams(search).getAll(name);
	if (values.length === 0) return { kind: 'absent' };
	if (values.length > 1) return { kind: 'invalid' };
	return ID_PATTERN.test(values[0]) ? { kind: 'ok', id: values[0] } : { kind: 'invalid' };
}

export type AccountDecision =
	| { kind: 'id'; id: string; source: 'as' | 'loginId' | 'first' }
	| { kind: 'invalid' }
	| { kind: 'none' };

/**
 * 起動するアカウントの決め方: ?as= → ?loginId= → 保存済みの先頭。?asが無いURLは常に先頭(タブの記憶は使わない)。固定はURLの ?as= だけで保つ。
 * ?as= が不正なときは別のアカウントに落とさず invalid を返す。
 */
export function decideAccount(opts: { search: string; firstId: string | null }): AccountDecision {
	const as = parseAccountParam(opts.search, 'as');
	if (as.kind === 'invalid') return { kind: 'invalid' };
	if (as.kind === 'ok') return { kind: 'id', id: as.id, source: 'as' };

	const loginId = parseAccountParam(opts.search, 'loginId');
	if (loginId.kind === 'invalid') return { kind: 'invalid' };
	if (loginId.kind === 'ok') return { kind: 'id', id: loginId.id, source: 'loginId' };

	if (opts.firstId != null) return { kind: 'id', id: opts.firstId, source: 'first' };
	return { kind: 'none' };
}

type PrefRecord = [scope: Record<string, unknown>, value: unknown, meta?: unknown];

/**
 * localStorage の preferences(プロファイルJSON)から、アカウント一覧の先頭のうち
 * 対象ホストの最初のIDを返す。トークンが無くても後続の別アカウントには進めない。一覧の順序はアカウントメニューの表示順と同じ。
 */
export function pickFirstAccountId(prefsJson: string | null, host: string): string | null {
	if (prefsJson == null) return null;
	let records: PrefRecord[];
	try {
		const profile = JSON.parse(prefsJson);
		records = profile?.preferences?.accounts;
	} catch {
		return null;
	}
	if (!Array.isArray(records)) return null;
	const record = records.find(r => Array.isArray(r) && r[0] != null && Object.keys(r[0]).length === 0) ?? records[0];
	const accounts = Array.isArray(record) ? record[1] : null;
	if (!Array.isArray(accounts)) return null;
	for (const entry of accounts) {
		if (!Array.isArray(entry)) continue;
		const [accountHost, user] = entry as [string, { id?: unknown }];
		if (accountHost !== host || typeof user?.id !== 'string') continue;
		return user.id;
	}
	return null;
}

/**
 * パス(または絶対URL)に ?as= を付ける。id が null なら ?as= と ?loginId= を取り除く。
 * ?loginId= は ?as= に置き換わるので常に取り除く。クエリの残りとハッシュは保つ。
 */
export function withAccount(url: string, id: string | null): string {
	const base = 'http://localhost';
	const isRelative = !/^[a-z][a-z0-9+.-]*:/i.test(url);
	const u = new URL(url, base);
	u.searchParams.delete('as');
	u.searchParams.delete('loginId');
	if (id != null) u.searchParams.set('as', id);
	return isRelative ? u.pathname + u.search + u.hash : u.href;
}
