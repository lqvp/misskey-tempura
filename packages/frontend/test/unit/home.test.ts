/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, test, vi } from 'vitest';
import { cleanup, render, waitFor, type RenderResult } from '@testing-library/vue';
import * as Misskey from 'misskey-js';
import { directives } from '@/directives/index.js';
import { components } from '@/components/index.js';
import XHome from '@/pages/user/home.vue';
import 'intersection-observer';

describe('XHome', () => {
	const renderHome = (user: Partial<Misskey.entities.UserDetailed>): RenderResult => {
		return render(XHome, {
			props: { user: user as Misskey.entities.UserDetailed, disableNotes: true },
			global: { directives, components },
		});
	};

	afterEach(() => {
		cleanup();
	});

	test('Should render the remote caution when user.host exists', async () => {
		const home = renderHome({
			id: 'blobcat',
			name: 'blobcat',
			host: 'example.com',
			uri: 'https://example.com/@user',
			url: 'https://example.com/@user/profile',
			roles: [],
			createdAt: '1970-01-01T00:00:00.000Z',
			fields: [],
			pinnedNotes: [],
			avatarUrl: 'https://example.com',
			avatarDecorations: [],
		});

		const anchor = home.container.querySelector<HTMLAnchorElement>('a[href^="https://example.com/"]');
		assert.exists(anchor, 'anchor to the remote exists');
		assert.strictEqual(anchor?.href, 'https://example.com/@user/profile');
	});

	test('The remote caution should fall back to uri if url is null', async () => {
		const home = renderHome({
			id: 'blobcat',
			name: 'blobcat',
			host: 'example.com',
			uri: 'https://example.com/@user',
			url: null,
			roles: [],
			createdAt: '1970-01-01T00:00:00.000Z',
			fields: [],
			pinnedNotes: [],
			avatarUrl: 'https://example.com',
			avatarDecorations: [],
		});

		const anchor = home.container.querySelector<HTMLAnchorElement>('a[href^="https://example.com/"]');
		assert.exists(anchor, 'anchor to the remote exists');
		assert.strictEqual(anchor?.href, 'https://example.com/@user');
	});

	const listenbrainzUser = {
		id: 'listenbrainz-user',
		name: 'listenbrainz-user',
		username: 'listenbrainz-user',
		host: null,
		uri: 'https://example.com/@listenbrainz-user',
		url: null,
		roles: [],
		createdAt: '1970-01-01T00:00:00.000Z',
		fields: [],
		pinnedNotes: [],
		avatarUrl: 'https://example.com',
		avatarDecorations: [],
	};

	const mockPlayingNowFetch = () => vi.spyOn(window, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ payload: { listens: [] } }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	}));

	test('Should fetch playing-now when listenbrainz (lowercase) is present', async () => {
		const fetchSpy = mockPlayingNowFetch();

		renderHome({ ...listenbrainzUser, listenbrainz: 'lbuser' } as any);

		await waitFor(() => {
			assert.ok(fetchSpy.mock.calls.some(([url]) => String(url).includes('/user/lbuser/playing-now')));
		});

		fetchSpy.mockRestore();
	});

});
