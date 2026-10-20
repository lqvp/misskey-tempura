/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { beforeAll, describe, test } from 'vitest';
import { api, post, relativeFetch, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

const AP = 'application/activity+json';

// 配送先を指定したノートが、署名の無いリクエストに別のルートから漏れないこと
describe('ActivityPub: notes with delivery targets', () => {
	let alice: misskey.entities.SignupResponse;
	let includeNote: misskey.entities.Note;
	let publicNote: misskey.entities.Note;

	beforeAll(async () => {
		alice = await signup({ username: 'dtalice' });
		await api('admin/update-meta', { federation: 'all' }, alice);
		includeNote = await post(alice, { text: 'only for allowed', deliveryTargets: { mode: 'include', hosts: ['allowed.example.com'] } });
		publicNote = await post(alice, { text: 'for everyone' });
	}, 1000 * 60 * 2);

	test('/notes/:id は署名の無い相手に返さない', async () => {
		const res = await relativeFetch(`notes/${includeNote.id}`, { headers: { Accept: AP } });
		assert.strictEqual(res.status, 404);
	});

	test('/notes/:id/activity も署名の無い相手に返さない', async () => {
		const res = await relativeFetch(`notes/${includeNote.id}/activity`, { headers: { Accept: AP } });
		assert.strictEqual(res.status, 404);
	});

	test('outbox に載せない', async () => {
		const res = await relativeFetch(`users/${alice.id}/outbox?page=true`, { headers: { Accept: AP } });
		assert.strictEqual(res.status, 200);
		const body = await res.json() as { orderedItems: { object?: { id?: string } | string }[] };
		const ids = body.orderedItems.map(item => typeof item.object === 'string' ? item.object : item.object?.id);
		assert.ok(ids.some(id => id?.endsWith(`/notes/${publicNote.id}`)));
		assert.ok(!ids.some(id => id?.endsWith(`/notes/${includeNote.id}`)));
	});

	test('featured に載せない', async () => {
		await api('i/pin', { noteId: includeNote.id }, alice);
		const res = await relativeFetch(`users/${alice.id}/collections/featured`, { headers: { Accept: AP } });
		assert.strictEqual(res.status, 200);
		const body = await res.json() as { orderedItems: { id: string }[] };
		assert.ok(!body.orderedItems.some(item => item.id.endsWith(`/notes/${includeNote.id}`)));
	});

	test('相手によって結果が変わるので、共有キャッシュに載せない', async () => {
		const res = await relativeFetch(`notes/${publicNote.id}`, { headers: { Accept: AP } });
		assert.strictEqual(res.status, 200);
		assert.match(res.headers.get('cache-control') ?? '', /^private\b/);
		assert.match(res.headers.get('vary') ?? '', /Signature/i);
	});
});
