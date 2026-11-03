/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { BroadcastChannel } from 'broadcast-channel';

// 再読み込み用の 'reload' チャンネルとは別。型を変えないので、古い版の開きっぱなしのタブは何もしない。
type AccountEvent = { kind: 'account-removed'; id: string };

const accountEventsChannel = new BroadcastChannel<AccountEvent>('account-events');

export function postAccountRemoved(id: string): void {
	accountEventsChannel.postMessage({ kind: 'account-removed', id });
}

export function isRemovalOf(msg: unknown, myId: string | null | undefined): boolean {
	if (myId == null || typeof msg !== 'object' || msg === null) return false;
	const m = msg as Partial<AccountEvent>;
	return m.kind === 'account-removed' && typeof m.id === 'string' && m.id === myId;
}

export function onAccountEvent(cb: (msg: unknown) => void): void {
	accountEventsChannel.addEventListener('message', cb);
}
