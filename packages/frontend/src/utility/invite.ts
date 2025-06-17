/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { instance } from '@/instance.js';

export function copyInviteCode(code: string) {
	copyToClipboard(code);
}

export function copyInviteUrl(code: string) {
	const url = new URL(instance.uri);
	url.searchParams.set('invite-code', code);
	copyToClipboard(url.toString());
}
