/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { $i } from '@/i.js';

let multipleAccounts = false;

export function setMultipleAccounts(value: boolean) {
	multipleAccounts = value;
}

/** 保存済みアカウントが複数あるときだけ、タブのタイトルに @username を付ける */
export function tabTitle(title: string): string {
	return multipleAccounts && $i ? `@${$i.username} | ${title}` : title;
}
