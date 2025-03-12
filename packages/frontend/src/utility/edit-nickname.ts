/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { entities } from "misskey-js";
import { store } from "@/store.js";
import { prefer } from '@/preferences.js';
import * as os from '@/os';

export async function editNickname(user: entities.User) {
	if (!prefer.s.nicknameEnabled) return;
	const { result, canceled } = await os.inputText({
		title: 'ニックネームを編集',
		placeholder: user.name || user.username,
		default: store.s.nicknameMap[user.id] ?? null,
	});
	if (canceled) return;
	const newMap = { ...prefer.s.nicknameMap };
	if (result) {
		newMap[user.id] = result;
	} else {
		delete newMap[user.id];
	}
	await prefer.commit('nicknameMap', newMap);
}
