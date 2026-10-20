/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { miLocalStorage } from '@/local-storage.js';

/**
 * 不審なログインの検知で使う端末トークンを読み出す。
 * localStorage が使えない環境では undefined を返す。
 */
export function getLoginDeviceToken(): string | undefined {
	try {
		return miLocalStorage.getItem('loginDeviceToken') ?? undefined;
	} catch {
		return undefined;
	}
}

/**
 * サーバーから受け取った端末トークンを保存する。
 * localStorage が使えない環境では何もしない。
 */
export function saveLoginDeviceToken(deviceToken: string | null | undefined): void {
	if (deviceToken == null) return;
	try {
		miLocalStorage.setItem('loginDeviceToken', deviceToken);
	} catch {
		// localStorage が使えない環境では端末トークンを保存しない
	}
}
