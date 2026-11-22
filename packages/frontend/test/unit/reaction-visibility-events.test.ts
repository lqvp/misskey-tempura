/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import MkReactionsViewer from '@/components/MkReactionsViewer.vue';
import { globalEvents } from '@/events.js';
import { misskeyApi } from '@/utility/misskey-api.js';

vi.mock('@/i.js', () => ({ $i: { id: 'viewer', token: 'viewer-token' } }));
vi.mock('@/preferences.js', () => ({
	prefer: { s: { reactionChecksMuting: true, animation: false, showAvailableReactionsFirstInNote: false } },
}));
vi.mock('@/custom-emojis.js', () => ({ customEmojisMap: new Map() }));
vi.mock('@/components/MkReactionsViewer.reaction.vue', () => ({
	default: { props: ['reaction'], template: '<span>{{ reaction }}</span>' },
}));

const relations = ['mute/create', 'mute/delete', 'blocking/create', 'blocking/delete'] as const;

function mountViewer(reactions = { '👍': 1 } as Record<string, number>) {
	return render(MkReactionsViewer, {
		props: { note: { id: 'note' } as Misskey.entities.Note, noteId: 'note', reactions, reactionEmojis: {}, myReaction: null },
	});
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('reaction visibility after user relation changes', () => {
	test.each(relations)('%s refreshes mounted reactions without a count change', async endpoint => {
		let visible = endpoint.endsWith('/create');
		const check = vi.fn(() => visible ? [{ id: 'reactor' }] : []);
		vi.stubGlobal('fetch', vi.fn(async (url: string) => {
			if (url.endsWith('/notes/reactions')) return new Response(JSON.stringify(check()), { status: 200 });
			visible = !visible;
			return new Response(null, { status: 204 });
		}));
		const view = mountViewer();
		await waitFor(() => expect(Boolean(view.queryByText('👍'))).toBe(visible));
		expect(check).toHaveBeenCalledOnce();
		await misskeyApi(endpoint, { userId: 'reactor' });
		await waitFor(() => expect(Boolean(view.queryByText('👍'))).toBe(visible));
		expect(check).toHaveBeenCalledTimes(2);
		view.unmount();
		globalEvents.emit('userRelationsChanged');
		expect(check).toHaveBeenCalledTimes(2);
	});

	test('does not check an empty reaction list after a relation change', async () => {
		const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal('fetch', fetch);
		const view = mountViewer({});
		await misskeyApi('mute/create', { userId: 'reactor' });
		expect(view.container.textContent).toBe('');
		expect(fetch).toHaveBeenCalledOnce();
	});

	test.each(relations)('does not emit for a failed %s', async endpoint => {
		const changed = vi.fn();
		globalEvents.on('userRelationsChanged', changed);
		try {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'DENIED' } }), { status: 400 })));
			await expect(misskeyApi(endpoint, { userId: 'reactor' })).rejects.toEqual({ code: 'DENIED' });
			expect(changed).not.toHaveBeenCalled();
		} finally {
			globalEvents.off('userRelationsChanged', changed);
		}
	});

	test('does not emit for another account or an unrelated endpoint', async () => {
		const changed = vi.fn();
		globalEvents.on('userRelationsChanged', changed);
		try {
			vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(null, { status: 204 })));
			await misskeyApi('mute/create', { userId: 'reactor' }, 'another-token');
			await misskeyApi('notes/reactions', { noteId: 'note' });
			expect(changed).not.toHaveBeenCalled();
		} finally {
			globalEvents.off('userRelationsChanged', changed);
		}
	});
});
