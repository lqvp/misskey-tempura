/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { decideAccount, pickFirstAccountId } from '@/utility/pinned-account.js';

export type AccountWithToken = Record<string, any> & { id: string; token: string };

export type BootAccountError = 'invalid-param' | 'unknown-account' | 'no-account-info' | 'unsafe-storage' | 'storage-failed';

export type BootAccount = {
	me: AccountWithToken | null;
	id: string | null;
	source: 'as' | 'loginId' | 'first' | 'legacy' | 'none';
	error: BootAccountError | null;
};

type BaseState = {
	accountTokens?: Record<string, string>;
	accountInfos?: Record<string, Record<string, any>>;
} | null | undefined;

/**
 * 起動時のアカウントを決める。不明・失効・不正なときは別のアカウントにせず error を返す。
 * ?as= も ?loginId= も無く保存済みアカウントも無いときだけ、従来の localStorage の account を使う(旧データの救済)。
 */
export async function resolveBootAccount(deps: {
	search: string;
	canSafelyWritePreferences?: boolean;
	host: string;
	prefsJson: string | null;
	legacyAccountJson: string | null;
	getBase: () => Promise<BaseState>;
}): Promise<BootAccount> {
	if (deps.canSafelyWritePreferences === false) return { me: null, id: null, source: 'none', error: 'unsafe-storage' };
	const base = await deps.getBase().catch(() => null);
	const tokens = base?.accountTokens ?? {};
	const infos = base?.accountInfos ?? {};

	const decision = decideAccount({
		search: deps.search,
		firstId: pickFirstAccountId(deps.prefsJson, deps.host),
	});

	if (decision.kind === 'invalid') {
		return { me: null, id: null, source: 'none', error: 'invalid-param' };
	}

	if (decision.kind === 'none') {
		if (deps.legacyAccountJson) {
			try {
				const me = JSON.parse(deps.legacyAccountJson) as AccountWithToken;
				return { me, id: me.id, source: 'legacy', error: null };
			} catch { /* 壊れていれば未ログイン扱い */ }
		}
		return { me: null, id: null, source: 'none', error: null };
	}

	const key = deps.host + '/' + decision.id;
	const token = tokens[key];
	if (!token) {
		return { me: null, id: decision.id, source: decision.source, error: 'unknown-account' };
	}
	const info = infos[key];
	if (!info || info.id !== decision.id) {
		return { me: null, id: decision.id, source: decision.source, error: 'no-account-info' };
	}
	return { me: { ...info, id: decision.id, token }, id: decision.id, source: decision.source, error: null };
}
