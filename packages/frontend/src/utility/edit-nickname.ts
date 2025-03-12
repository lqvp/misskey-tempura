/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { entities } from "misskey-js";
import { defaultStore } from "@/store";
import * as os from '@/os';

export async function editNickname(user: entities.User) {
	if (!defaultStore.state.nicknameEnabled) return;
	const { result, canceled } = await os.inputText({
		title: 'ニックネームを編集',
		placeholder: user.name || user.username,
		default: defaultStore.state.nicknameMap[user.id] ?? null,
	});
	if (canceled) return;
	const newMap = { ...defaultStore.state.nicknameMap };
	if (result) {
		newMap[user.id] = result;
	} else {
		delete newMap[user.id];
	}
	await defaultStore.set('nicknameMap', newMap);
}
