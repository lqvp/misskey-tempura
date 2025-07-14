/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref, watch } from 'vue';
import { prefer } from '@/preferences.js';

const MAX_VIEWED_RENOTES = 1000;

const viewedRenotesCache = ref(new Set(prefer.s.viewedRenotes));

let internalBuffer: string[] = [...prefer.s.viewedRenotes];
let bufferIndex = internalBuffer.length;

watch(() => prefer.s.viewedRenotes, (newViewed) => {
	viewedRenotesCache.value = new Set(newViewed);
	internalBuffer = [...newViewed];
	bufferIndex = internalBuffer.length;
}, { deep: true });

export function useViewedRenotes() {
	function add(noteId: string) {
		if (viewedRenotesCache.value.has(noteId)) return;

		if (bufferIndex >= MAX_VIEWED_RENOTES) {
			const oldestIndex = bufferIndex % MAX_VIEWED_RENOTES;
			const oldestItem = internalBuffer[oldestIndex];

			viewedRenotesCache.value.delete(oldestItem);

			internalBuffer[oldestIndex] = noteId;
			viewedRenotesCache.value.add(noteId);

			bufferIndex++;

			const startIdx = (bufferIndex - MAX_VIEWED_RENOTES) % MAX_VIEWED_RENOTES;
			const result = new Array(MAX_VIEWED_RENOTES);
			for (let i = 0; i < MAX_VIEWED_RENOTES; i++) {
				result[i] = internalBuffer[(startIdx + i) % MAX_VIEWED_RENOTES];
			}
			prefer.s.viewedRenotes = result;
		} else {
			internalBuffer[bufferIndex] = noteId;
			viewedRenotesCache.value.add(noteId);
			bufferIndex++;

			prefer.s.viewedRenotes = internalBuffer.slice(0, bufferIndex);
		}
	}

	function has(noteId: string): boolean {
		return viewedRenotesCache.value.has(noteId);
	}

	function clear() {
		prefer.s.viewedRenotes = [];
		viewedRenotesCache.value.clear();
		internalBuffer = [];
		bufferIndex = 0;
	}

	return {
		add,
		has,
		clear,
	};
}
