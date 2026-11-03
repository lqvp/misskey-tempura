/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { reactive } from 'vue';
import * as Misskey from 'misskey-js';
import { host } from '@@/js/config.js';
import { miLocalStorage } from '@/local-storage.js';
import { get, isIdbAvailable } from '@/utility/idb-proxy.js';
import { resolveBootAccount } from '@/utility/boot-account.js';
import { withAccount } from '@/utility/pinned-account.js';

// TODO: 他のタブと永続化されたstateを同期

type AccountWithToken = Misskey.entities.MeDetailed & { token: string };

const boot = await resolveBootAccount({
	search: window.location.search,
	canSafelyWritePreferences: isIdbAvailable(),
	host,
	prefsJson: miLocalStorage.getItem('preferences'),
	legacyAccountJson: miLocalStorage.getItem('account'),
	getBase: () => get('pizzax::base'),
});

// このタブで使うアカウントの決定結果。error があるときは別アカウントにせず、起動画面で止める。
export const bootAccount = { source: boot.source, error: boot.error, id: boot.id };

// TODO: 外部からはreadonlyに
export const $i = boot.me ? reactive(boot.me as AccountWithToken) : null;

if (boot.id != null && boot.error == null) {
	// 先頭を選んだ場合も含め、URLに ?as= を付ける。以降のリロードはこの ?as= で固定される
	const current = window.location.pathname + window.location.search + window.location.hash;
	const next = withAccount(current, boot.id);
	if (next !== current) window.history.replaceState(window.history.state, '', next);
}

export const iAmModerator = $i != null && ($i.isAdmin === true || $i.isModerator === true);
export const iAmAdmin = $i != null && $i.isAdmin;

export function ensureSignin() {
	if ($i == null) throw new Error('signin required');
	return $i;
}

export let notesCount = $i == null ? 0 : $i.notesCount;
export function incNotesCount() {
	notesCount++;
}

if (_DEV_) {
	(window as any).$i = $i;
}
