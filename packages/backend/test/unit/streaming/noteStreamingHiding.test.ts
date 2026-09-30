/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect } from 'vitest';
import { NoteStreamingHidingService } from '@/server/api/stream/NoteStreamingHidingService.js';

const mkUser = (id: string, host: string | null = null) => ({ id, host, username: id, name: id, isBot: false });

const mkNote = (id: string, extra: Record<string, unknown> = {}) => ({
	id,
	userId: id + '-u',
	user: mkUser(id + '-u'),
	text: 'hello',
	visibility: 'public',
	reactions: {},
	reactionAndUserPairCache: ['u9/❤', 'u10/❤'],
	...extra,
});

const meta = (ugcVisibilityForVisitor: 'all' | 'local' | 'none') => ({
	fetch: async () => ({ ugcVisibilityForVisitor }),
});

const entity = (shouldHide = false) => ({
	shouldHideNote: async () => shouldHide,
	hideNote: (n: any) => { n.text = null; },
});

describe('NoteStreamingHidingService reaction cache gating', () => {
	test('anonymous: reactionAndUserPairCache is stripped from top note', async () => {
		const svc = new NoteStreamingHidingService(entity() as any, meta('all') as any);
		const out = await svc.filter(mkNote('a') as any, null);
		expect(out).not.toBeNull();
		expect(out!.reactionAndUserPairCache).toBeUndefined();
	});

	test('anonymous: cache is stripped across the renote chain', async () => {
		const svc = new NoteStreamingHidingService(entity() as any, meta('all') as any);
		const quote = mkNote('b', { renote: mkNote('a') });
		const out = await svc.filter(quote as any, null);
		expect(out!.reactionAndUserPairCache).toBeUndefined();
		expect(out!.renote!.reactionAndUserPairCache).toBeUndefined();
	});

	test.each([false, true])('anonymous: reply caches are stripped with hidden=%s without mutating shared notes', async hidden => {
		const svc = new NoteStreamingHidingService(entity(hidden) as any, meta('all') as any);
		const note = mkNote('quote', {
			reply: mkNote('reply'),
			renote: mkNote('renote', { reply: mkNote('renote-reply') }),
		});
		const out = await svc.filter(note as any, null);
		expect(out!.reply!.reactionAndUserPairCache).toBeUndefined();
		expect(out!.renote!.reply!.reactionAndUserPairCache).toBeUndefined();
		expect(((note as any).reply).reactionAndUserPairCache).toHaveLength(2);
		expect(((note as any).renote).reply.reactionAndUserPairCache).toHaveLength(2);
	});

	test('authenticated: cache is preserved', async () => {
		const svc = new NoteStreamingHidingService(entity() as any, meta('all') as any);
		const out = await svc.filter(mkNote('a') as any, 'me');
		expect(out!.reactionAndUserPairCache).toEqual(['u9/❤', 'u10/❤']);
	});

	test('anonymous + ugcVisibilityForVisitor=none: note suppressed entirely', async () => {
		const svc = new NoteStreamingHidingService(entity() as any, meta('none') as any);
		const out = await svc.filter(mkNote('a') as any, null);
		expect(out).toBeNull();
	});

	test('anonymous + local gate: remote note suppressed, local note passes', async () => {
		const remote = mkNote('a');
		(remote as any).user = mkUser('a-u', 'remote.example');
		(remote as any).userHost = 'remote.example';
		const svc = new NoteStreamingHidingService(entity() as any, meta('local') as any);
		expect(await svc.filter(remote as any, null)).toBeNull();
		expect(await svc.filter(mkNote('a') as any, null)).not.toBeNull();
	});

	test('anonymous + hidden note: hideNote path still strips cache', async () => {
		const svc = new NoteStreamingHidingService(entity(true) as any, meta('all') as any);
		const out = await svc.filter(mkNote('a') as any, null);
		expect(out).not.toBeNull();
		expect(out!.text).toBeNull();
		expect(out!.reactionAndUserPairCache).toBeUndefined();
	});

	test('authenticated + hidden note: hideNote path keeps cache', async () => {
		const svc = new NoteStreamingHidingService(entity(true) as any, meta('all') as any);
		const out = await svc.filter(mkNote('a') as any, 'me');
		expect(out!.text).toBeNull();
		expect(out!.reactionAndUserPairCache).toEqual(['u9/❤', 'u10/❤']);
	});
});


describe('NoteStreamingHidingService reply visibility', () => {
	test.each([false, true])('hides replies throughout the cloned chain, pure renote=%s', async pureRenote => {
		const svc = new NoteStreamingHidingService({
			shouldHideNote: async (note: any) => note.id.endsWith('reply'),
			hideNote: (note: any) => { note.text = null; },
		} as any, meta('all') as any);
		const note = mkNote('top', {
			text: pureRenote ? null : 'quote', renoteId: 'inner',
			...(pureRenote ? {} : { reply: mkNote('top-reply') }),
			renote: mkNote('inner', { reply: mkNote('inner-reply') }),
		});
		const out = await svc.filter(note as any, 'viewer');
		expect(out).not.toBeNull();
		expect(out).not.toBe(note);
		expect(out!.renote!.text).toBe('hello');
		expect(out!.renote!.reply!.text).toBeNull();
		if (!pureRenote) expect(out!.reply!.text).toBeNull();
		expect((note as any).renote.reply.text).toBe('hello');
	});
});
