/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import { components } from '@/components/index.js';
import { directives } from '@/directives/index.js';
import XListenBrainz from '@/pages/user/index.listenbrainz.vue';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

describe('XListenBrainz', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	test('sanitizes origin_url and encodes the username', async () => {
		const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/metadata/lookup')) {
				return jsonResponse({});
			}
			if (url.includes('/user/a%20b/playing-now')) {
				return jsonResponse({
					payload: {
						listens: [{
							track_metadata: {
								track_name: 'track',
								artist_name: 'artist',
								playing_now: true,
								additional_info: { origin_url: 'javascript:alert(1)' },
							},
						}],
					},
				});
			}
			return jsonResponse({}, 404);
		});

		const result = render(XListenBrainz, {
			props: { user: { id: 'x', listenbrainz: 'a b' } as any },
			global: { components, directives },
		});

		await waitFor(() => {
			assert.match(result.container.textContent ?? '', /track/);
		});

		assert.ok(fetchSpy.mock.calls.some(([url]) => String(url).includes('/user/a%20b/playing-now')));
		for (const anchor of result.container.querySelectorAll('a')) {
			assert.strictEqual(anchor.getAttribute('href'), '#');
		}
	});

});
