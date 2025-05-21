/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiUser } from '@/models/User.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import { checkWordMute } from './check-word-mute.js';

/**
 * Checks if a note should be muted based on per-server word mute settings.
 * @param note The note to check.
 * @param perServerMuteWords The user's per-server mute word settings.
 * @param me The current user (for context in checkWordMute, e.g., not muting self).
 * @returns True if the note should be muted, false otherwise.
 */
export async function checkPerServerWordMute(
	note: MiNote, // Use the actual MiNote type
	perServerMuteWords: MiUserProfile['perServerMuteWords'],
	me: { id: string } | null | undefined, // Allow a simpler object with just id for 'me'
): Promise<boolean> {
	// Ensure note.user and note.user.host are valid before proceeding
	if (!note.user?.host || !perServerMuteWords || perServerMuteWords.length === 0) {
		return false;
	}

	const noteHost = note.user.host;

	for (const serverSetting of perServerMuteWords) {
		if (serverSetting.fqdn === noteHost) {
			// Found a setting for the note's origin server
			// Pass the full note and user objects to checkWordMute
			if (await checkWordMute(note, me, serverSetting.words)) {
				return true; // Muted by this server's settings
			}
		}
	}

	return false; // Not muted by any per-server settings
}
