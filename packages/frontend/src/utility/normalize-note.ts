/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';

export type NormalizedNote = Misskey.entities.Note & {
	deliveryTargets?: { mode: 'include' | 'exclude'; hosts: string[] } | null;
};

/**
 * Ensure optional fields of Note are safely populated for template usage.
 * Currently fills deliveryTargets.hosts to an empty array when missing.
 */
export function normalizeNote(note: Misskey.entities.Note): NormalizedNote {
	const cloned: NormalizedNote = { ...(note as any) };

	if (cloned.deliveryTargets) {
		cloned.deliveryTargets = {
			...cloned.deliveryTargets,
			hosts: cloned.deliveryTargets.hosts ?? [],
		};
	}

	return cloned;
}
