/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { HttpResponse, http } from 'msw';
import { commonHandlers } from '../../.storybook/mocks.js';
import { note, userLite } from '../../.storybook/fakes.js';

const pendingNotes = Array.from({ length: 12 }, (_, index) => {
	const id = `tl-digest-story-${index + 1}`;
	return {
		...note(id),
		createdAt: new Date(Date.UTC(2026, 10, 24, 8, index)).toISOString(),
		userId: `story-user-${index + 1}`,
		user: {
			...userLite(`story-user-${index + 1}`, `story_user_${index + 1}`, null, 'Story User'),
		},
		text: `Storybook用のダミーノート ${index + 1}`,
		visibility: 'public',
	};
});

export const handlers = [
	...commonHandlers,
	http.post('/api/notes/timeline', () => {
		return HttpResponse.json(pendingNotes);
	}),
];
