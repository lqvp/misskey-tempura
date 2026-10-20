/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { stringifyWithAvatarDecorationMuting } from '@/server/api/stream/applyAvatarDecorationMuting.js';

function user(id: string, decorationId: string) {
	return {
		id,
		username: id,
		avatarUrl: `https://example.test/${id}.png`,
		avatarDecorations: [{ id: decorationId, url: `https://example.test/${decorationId}.png` }],
	};
}

describe('stringifyWithAvatarDecorationMuting', () => {
	test('removes avatarDecorations for muted users recursively', () => {
		const payload = {
			type: 'channel',
			body: {
				id: 'ch-1',
				type: 'note',
				body: {
					id: 'note-1',
					user: user('muted-user', 'd1'),
					renote: {
						id: 'note-2',
						user: user('ok-user', 'd2'),
						reply: {
							id: 'note-3',
							user: user('muted-user', 'd3'),
						},
					},
				},
			},
		};

		const result = JSON.parse(stringifyWithAvatarDecorationMuting(payload, new Set(['muted-user'])));

		expect(result.body.body.user.avatarDecorations).toEqual([]);
		expect(result.body.body.renote.user.avatarDecorations).toHaveLength(1);
		expect(result.body.body.renote.reply.user.avatarDecorations).toEqual([]);
	});

	test('does not mutate the shared payload', () => {
		const payload = { body: { user: user('muted-user', 'd1') } };

		stringifyWithAvatarDecorationMuting(payload, new Set(['muted-user']));

		expect(payload.body.user.avatarDecorations).toHaveLength(1);
	});

	test('matches JSON.stringify for empty muted set', () => {
		const payload = { body: { user: user('u1', 'd1') } };

		expect(stringifyWithAvatarDecorationMuting(payload, new Set())).toBe(JSON.stringify(payload));
	});
});
