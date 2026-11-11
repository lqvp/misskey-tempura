/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { entities } from 'misskey-js';
import { miLocalStorage } from '@/local-storage.js';
import { get } from '@/utility/idb-proxy.js';
import { selectTabAccount } from '@/utility/tab-account.js';

// Read only the existing account list and token map, before $i/store are initialized.
export async function bootstrapAccount(url: string, host: string): Promise<(entities.MeDetailed & { token: string }) | null> {
	const profile = miLocalStorage.getItemAsJson('preferences');
	const records = profile?.preferences?.accounts ?? [];
	const record = records.find(([scope]: [{ server?: string; account?: string }]) => scope.server === host && scope.account == null)
		?? records.find(([scope]: [{ server?: string; account?: string }]) => scope.server == null && scope.account == null);
	const accounts = record?.[1] ?? [];
	const id = selectTabAccount(url, accounts, host);
	if (id == null) return null;
	const device = await get('pizzax::base');
	const token = device?.accountTokens?.[host + '/' + id];
	if (!token) throw new Error('The selected account has no saved token. Sign in again from another tab.');
	const me = device?.accountInfos?.[host + '/' + id];
	if (!me || me.id !== id) throw new Error('The selected account has no matching saved account information. Sign in again from another tab.');
	return { ...me, token };
}
