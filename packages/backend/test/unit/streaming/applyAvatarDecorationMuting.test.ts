/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { applyAvatarDecorationMuting } from '@/server/api/stream/applyAvatarDecorationMuting.js';

describe('applyAvatarDecorationMuting', () => {
	test('removes avatarDecorations for muted users recursively', () => {
		const payload: any = {
			type: 'channel',
			body: {
				id: 'ch-1',
				type: 'note',
				body: {
					id: 'note-1',
					user: {
						id: 'muted-user',
						username: 'muted',
						avatarUrl: 'https://example.test/a.png',
						avatarDecorations: [{ id: 'd1', url: 'https://example.test/d1.png' }],
					},
					renote: {
						id: 'note-2',
						user: {
							id: 'ok-user',
							username: 'ok',
							avatarUrl: 'https://example.test/b.png',
							avatarDecorations: [{ id: 'd2', url: 'https://example.test/d2.png' }],
						},
						reply: {
							id: 'note-3',
							user: {
								id: 'muted-user',
								username: 'muted',
								avatarUrl: 'https://example.test/a.png',
								avatarDecorations: [{ id: 'd3', url: 'https://example.test/d3.png' }],
							},
						},
					},
				},
			},
		};

		applyAvatarDecorationMuting(payload, new Set(['muted-user']));

		expect(payload.body.body.user.avatarDecorations).toEqual([]);
		expect(payload.body.body.renote.user.avatarDecorations).toHaveLength(1);
		expect(payload.body.body.renote.reply.user.avatarDecorations).toEqual([]);
	});

	test('does nothing for empty muted set', () => {
		const user: any = {
			id: 'u1',
			username: 'u1',
			avatarUrl: 'https://example.test/a.png',
			avatarDecorations: [{ id: 'd1', url: 'https://example.test/d1.png' }],
		};

		applyAvatarDecorationMuting(user, new Set());

		expect(user.avatarDecorations).toHaveLength(1);
	});

	test('handles circular references', () => {
		const user: any = {
			id: 'muted-user',
			username: 'muted',
			avatarUrl: 'https://example.test/a.png',
			avatarDecorations: [{ id: 'd1', url: 'https://example.test/d1.png' }],
		};
		const wrapper: any = { user };
		wrapper.self = wrapper;
		user.wrapper = wrapper;

		applyAvatarDecorationMuting(wrapper, new Set(['muted-user']));

		expect(user.avatarDecorations).toEqual([]);
	});
});
