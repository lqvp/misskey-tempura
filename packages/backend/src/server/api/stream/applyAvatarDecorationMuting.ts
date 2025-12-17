/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Mutates packed payloads in-place to remove avatar decorations for muted users.
 *
 * This is used for streaming payloads where packing is performed without a viewer context
 * (e.g. `NoteEntityService.pack(note, null, ...)`) and must be adjusted per connection.
 */
export function applyAvatarDecorationMuting(value: unknown, mutedUserIds: ReadonlySet<string>): void {
	if (mutedUserIds.size === 0) return;

	const stack: unknown[] = [value];

	while (stack.length > 0) {
		const current = stack.pop();

		if (current == null) continue;

		if (Array.isArray(current)) {
			for (let i = 0; i < current.length; i++) {
				stack.push(current[i]);
			}
			continue;
		}

		if (typeof current !== 'object') continue;

		const obj = current as Record<string, unknown>;

		// UserLite/UserDetailed-like objects always have `id` and `avatarDecorations`.
		const id = obj.id;
		const username = obj.username;
		const avatarDecorations = obj.avatarDecorations;
		if (
			typeof id === 'string' &&
			typeof username === 'string' &&
			Array.isArray(avatarDecorations) &&
			mutedUserIds.has(id)
		) {
			obj.avatarDecorations = [];
		}

		for (const key of Object.keys(obj)) {
			stack.push(obj[key]);
		}
	}
}

