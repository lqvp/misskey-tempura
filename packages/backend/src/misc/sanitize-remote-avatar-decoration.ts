/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiUser } from '@/models/User.js';

/** `i/update` の paramDef と同じ上限 */
export const MAX_REMOTE_AVATAR_DECORATIONS = 16;

/** avatar_decoration.id の列長 (varchar(32)) */
const MAX_ID_LENGTH = 32;

function clampNumber(value: unknown, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
	return Math.min(max, Math.max(min, value));
}

export type SanitizedRemoteAvatarDecoration = {
	url: string;
	decoration: MiUser['avatarDecorations'][number];
};

/**
 * リモートサーバーの users/show が返したデコレーション 1 件を検証し、保存してよい形に整える。
 * 不正な要素は null を返す。数値は `i/update` と同じ範囲に丸め、未知のフィールドは捨てる。
 */
export function sanitizeRemoteAvatarDecoration(raw: unknown): SanitizedRemoteAvatarDecoration | null {
	if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const deco = raw as Record<string, unknown>;

	if (typeof deco.id !== 'string' || deco.id.length === 0 || deco.id.length > MAX_ID_LENGTH) return null;
	if (typeof deco.url !== 'string' || !deco.url.startsWith('https://')) return null;

	return {
		url: deco.url,
		decoration: {
			id: deco.id,
			angle: clampNumber(deco.angle, -0.5, 0.5),
			flipH: deco.flipH === true,
			offsetX: clampNumber(deco.offsetX, -0.25, 0.25),
			offsetY: clampNumber(deco.offsetY, -0.25, 0.25),
			showBehind: deco.showBehind === true,
		},
	};
}
