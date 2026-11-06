/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// SafariがBroadcastChannel未実装なのでライブラリを使う
import { BroadcastChannel } from 'broadcast-channel';
import { accountUrl } from '@/utility/tab-account.js';

export const reloadChannel = new BroadcastChannel<string | null>('reload');

// BroadcastChannelを用いて、クライアントが一斉にreloadするようにします。
export function unisonReload(path?: string) {
	if (path !== undefined) {
		reloadChannel.postMessage(path);
		window.location.href = path === '/' ? path : accountUrl(path, new URLSearchParams(window.location.search).get('as'));
	} else {
		reloadChannel.postMessage(null);
		window.location.reload();
	}
}
