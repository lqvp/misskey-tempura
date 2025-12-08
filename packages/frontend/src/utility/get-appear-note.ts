/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';

export function getAppearNote(note: Misskey.entities.Note) {
	const appear = Misskey.note.isPureRenote(note) ? note.renote : note;

	if (appear?.deliveryTargets) {
		appear.deliveryTargets.hosts = appear.deliveryTargets.hosts ?? [];
	}

	return appear;
}
