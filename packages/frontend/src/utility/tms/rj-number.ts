/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { h } from 'vue';
import type { VNode } from 'vue';
import TmsRjNumber from '@/components/TmsRjNumber.vue';
import { parseRjNumberTokens } from '@/utility/tms/rj-number-parser.js';

export const parseMfmRjNumber = (text: string): (VNode | string)[] => {
	return parseRjNumberTokens(text).map((token) => {
		if (token.type === 'text') {
			return token.value;
		}
		return h(TmsRjNumber, {
			key: token.value,
			rjNumber: token.value,
			url: token.url,
		});
	});
};
