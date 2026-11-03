/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// SafariがBroadcastChannel未実装なのでライブラリを使う
import { BroadcastChannel } from 'broadcast-channel';
import { $i } from '@/i.js';
import { prefer } from '@/preferences.js';
import { withAccount } from '@/utility/pinned-account.js';

export const reloadChannel = new BroadcastChannel<string | null>('reload');

// BroadcastChannelを用いて、クライアントが一斉にreloadするようにします。
export function unisonLogout() {
	// 古いタブも文字列URLとして扱えるログアウト用の遷移先。受信側はアカウントを付け直さない。
	reloadChannel.postMessage('/?logout=1');
	window.location.href = '/';
}

export async function unisonReload(path?: string) {
	try { await prefer.flush(); } catch { return; }
	if (path !== undefined) {
		// 他のタブへは ?as= を付けずに送る(受け取ったタブが自分のアカウントを付ける)
		reloadChannel.postMessage(withAccount(path, null));
		window.location.href = withAccount(path, $i?.id ?? null);
	} else {
		reloadChannel.postMessage(null);
		window.location.reload();
	}
}
