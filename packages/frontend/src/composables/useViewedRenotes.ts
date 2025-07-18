/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed } from 'vue';
import { prefer } from '@/preferences.js';

const MAX_VIEWED_RENOTES = 1000;

// Use a computed property for the Set for efficient lookups.
// It will automatically update when `prefer.r.viewedRenotes` changes.
const viewedRenotesSet = computed(() => new Set(prefer.r.viewedRenotes.value));

export function useViewedRenotes() {
	function add(noteId: string) {
		if (!prefer.s.enableViewedRenotes) return;

		const currentList = prefer.s.viewedRenotes;
		const index = currentList.indexOf(noteId);

		// If noteId is already the most recent item, do nothing to avoid unnecessary commits.
		if (index === currentList.length - 1) {
			return;
		}

		// Create a mutable copy to work with.
		const newList = [...currentList];

		if (index !== -1) {
			// If the note is already in the list, remove it from its current position to move it to the end.
			newList.splice(index, 1);
		}

		// Add the note to the end of the list (most recently viewed).
		newList.push(noteId);

		// If the list exceeds the maximum size, remove the oldest item (from the beginning).
		if (newList.length > MAX_VIEWED_RENOTES) {
			newList.shift();
		}

		// Commit the updated list to preferences.
		prefer.commit('viewedRenotes', newList);
	}

	function has(noteId: string): boolean {
		// If the feature is disabled, always return false
		if (!prefer.s.enableViewedRenotes) return false;

		// Use the computed Set for efficient 'has' checks.
		return viewedRenotesSet.value.has(noteId);
	}

	function clear() {
		prefer.commit('viewedRenotes', []);
	}

	return {
		add,
		has,
		clear,
	};
}
