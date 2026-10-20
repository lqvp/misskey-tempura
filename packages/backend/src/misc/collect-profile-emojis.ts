/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';
import { extractCustomEmojisFromMfm } from '@/misc/extract-custom-emojis-from-mfm.js';

/**
 * ローカルユーザーのプロフィールに含まれるカスタム絵文字の名前を集める (users.emojis に保存するもの)。
 * 名前・追加情報は MFM の簡易構文、自己紹介・フォロー時のメッセージは通常の MFM として読む
 */
export function collectProfileEmojis(profile: {
	name: string | null;
	description: string | null;
	fields: { name: string; value: string }[];
	followedMessage: string | null;
}): string[] {
	const emojis: string[] = [];

	if (profile.name != null) {
		emojis.push(...extractCustomEmojisFromMfm(mfm.parseSimple(profile.name)));
	}
	if (profile.description != null) {
		emojis.push(...extractCustomEmojisFromMfm(mfm.parse(profile.description)));
	}
	for (const field of profile.fields) {
		emojis.push(...extractCustomEmojisFromMfm(mfm.parseSimple(field.name)));
		emojis.push(...extractCustomEmojisFromMfm(mfm.parseSimple(field.value)));
	}
	if (profile.followedMessage != null) {
		emojis.push(...extractCustomEmojisFromMfm(mfm.parse(profile.followedMessage)));
	}

	return emojis;
}
