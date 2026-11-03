/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createApp, defineAsyncComponent } from 'vue';
import { common } from './common.js';
import { emojiPicker } from '@/utility/emoji-picker.js';
import UiMinimum from '@/ui/minimum.vue';
import { bootAccount } from '@/i.js';

export async function subBoot() {
	const { isClientUpdated } = await common(async () => createApp(bootAccount.error ? (await import('@/ui/account-error.vue')).default : UiMinimum));

	emojiPicker.init();
}
