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

// 匿名アクセス(未ログインのWeb/署名なしのActivityPub取得)に対して、
// ローカルユーザーの非公開設定が全経路(SSR/OGP・embed・AP note/activity・outbox)で
// 一貫して効くこと。署名済みのリモート取得の分類は
// test/unit/ActivityPubAccessControlService.signature.test.ts で検証する。
describe('visitor anonymous access guarantee', () => {
	let admin: misskey.entities.SignupResponse;
	let alice: misskey.entities.SignupResponse; // 制限なし
	let bob: misskey.entities.SignupResponse; // requireSigninToViewContents
	let carol: misskey.entities.SignupResponse; // hidePublicNotes
	let dave: misskey.entities.SignupResponse; // hideHomeNotes
	let erin: misskey.entities.SignupResponse; // makeNotesHiddenBefore
	let frank: misskey.entities.SignupResponse; // makeNotesFollowersOnlyBefore

	let aliceNote: misskey.entities.Note;
	let aliceLocalOnlyNote: misskey.entities.Note;
	let bobNote: misskey.entities.Note;
	let carolNote: misskey.entities.Note;
	let daveHomeNote: misskey.entities.Note;
	let davePublicNote: misskey.entities.Note;
	let erinNote: misskey.entities.Note;
	let frankNote: misskey.entities.Note;

	const marker = (label: string) => `anon-test-${label}-${Date.now()}`;

	const apFetch = (path: string) => relativeFetch(path, { headers: { Accept: AP } });

	beforeAll(async () => {
		admin = await signup({ username: 'anonadmin' });
		await api('admin/update-meta', { federation: 'all' }, admin);

		alice = await signup({ username: 'anonalice' });
		bob = await signup({ username: 'anonbob' });
		carol = await signup({ username: 'anoncarol' });
		dave = await signup({ username: 'anondave' });
		erin = await signup({ username: 'anonerin' });
		frank = await signup({ username: 'anonfrank' });

		aliceNote = await post(alice, { text: marker('alice') });
		aliceLocalOnlyNote = await post(alice, { text: marker('alice-local'), localOnly: true });
		bobNote = await post(bob, { text: marker('bob') });
		carolNote = await post(carol, { text: marker('carol') });
		daveHomeNote = await post(dave, { text: marker('dave-home'), visibility: 'home' });
		davePublicNote = await post(dave, { text: marker('dave-public') });
		erinNote = await post(erin, { text: marker('erin') });
		frankNote = await post(frank, { text: marker('frank') });

		const futureCutoff = Math.floor(Date.now() / 1000) + 3600;
		await api('i/update', { requireSigninToViewContents: true }, bob);
		await api('i/update', { hidePublicNotes: true }, carol);
		await api('i/update', { hideHomeNotes: true }, dave);
		await api('i/update', { makeNotesHiddenBefore: futureCutoff }, erin);
		await api('i/update', { makeNotesFollowersOnlyBefore: futureCutoff }, frank);
	}, 1000 * 60 * 2);

	describe('ActivityPub (署名なしの取得)', () => {
		test('公開ノートは /notes/:id で返る', async () => {
			const res = await apFetch(`notes/${aliceNote.id}`);
			assert.strictEqual(res.status, 200);
		});

		test('requireSigninToViewContents のノートは /notes/:id で 404', async () => {
			assert.strictEqual((await apFetch(`notes/${bobNote.id}`)).status, 404);
		});

		test('requireSigninToViewContents のノートは /notes/:id/activity でも 404', async () => {
			assert.strictEqual((await apFetch(`notes/${bobNote.id}/activity`)).status, 404);
		});

		test('hidePublicNotes のノートは /notes/:id で 404', async () => {
			assert.strictEqual((await apFetch(`notes/${carolNote.id}`)).status, 404);
		});

		test('hideHomeNotes は home ノートを 404、public ノートは返す', async () => {
			assert.strictEqual((await apFetch(`notes/${daveHomeNote.id}`)).status, 404);
			assert.strictEqual((await apFetch(`notes/${davePublicNote.id}`)).status, 200);
		});

		test('makeNotesHiddenBefore より前のノートは 404', async () => {
			assert.strictEqual((await apFetch(`notes/${erinNote.id}`)).status, 404);
		});

		test('makeNotesFollowersOnlyBefore で followers 降格したノートは 404', async () => {
			assert.strictEqual((await apFetch(`notes/${frankNote.id}`)).status, 404);
		});

		test('localOnly ノートは 404', async () => {
			assert.strictEqual((await apFetch(`notes/${aliceLocalOnlyNote.id}`)).status, 404);
		});

		test('requireSigninToViewContents のユーザーの outbox は 404', async () => {
			assert.strictEqual((await apFetch(`users/${bob.id}/outbox?page=true`)).status, 404);
		});

		test('outbox は公開ノートを含み、localOnly ノートを含まない', async () => {
			const res = await apFetch(`users/${alice.id}/outbox?page=true`);
			assert.strictEqual(res.status, 200);
			const body = await res.json() as { orderedItems: { object?: { id?: string } | string }[] };
			const ids = body.orderedItems.map(item => typeof item.object === 'string' ? item.object : item.object?.id);
			assert.ok(ids.some(id => id?.endsWith(`/notes/${aliceNote.id}`)));
			assert.ok(!ids.some(id => id?.endsWith(`/notes/${aliceLocalOnlyNote.id}`)));
		});

		test('outbox は時限で隠れたノートを含まない', async () => {
			const res = await apFetch(`users/${erin.id}/outbox?page=true`);
			assert.strictEqual(res.status, 200);
			const body = await res.json() as { orderedItems: { object?: { id?: string } | string }[] };
			const ids = body.orderedItems.map(item => typeof item.object === 'string' ? item.object : item.object?.id);
			assert.ok(!ids.some(id => id?.endsWith(`/notes/${erinNote.id}`)));
		});

		test('ugcVisibilityForVisitor=none の間は outbox も 404', async () => {
			await api('admin/update-meta', { ugcVisibilityForVisitor: 'none' }, admin);
			try {
				assert.strictEqual((await apFetch(`users/${alice.id}/outbox?page=true`)).status, 404);
			} finally {
				await api('admin/update-meta', { ugcVisibilityForVisitor: 'all' }, admin);
			}
		});
	});

	describe('SSR/OGP (未ログインのWeb)', () => {
		test('公開ノートは本文が HTML に含まれる', async () => {
			const res = await relativeFetch(`notes/${aliceNote.id}`);
			assert.strictEqual(res.status, 200);
			const html = await res.text();
			assert.ok(html.includes(aliceNote.text ?? ''), 'note text should be in HTML');
		});

		test('requireSigninToViewContents のノートは本文が HTML に含まれない', async () => {
			const res = await relativeFetch(`notes/${bobNote.id}`);
			assert.strictEqual(res.status, 200);
			const html = await res.text();
			assert.ok(!html.includes(bobNote.text ?? ''), 'note text must not leak into HTML');
		});

		test('hidePublicNotes のノートは本文が HTML に含まれない', async () => {
			const html = await (await relativeFetch(`notes/${carolNote.id}`)).text();
			assert.ok(!html.includes(carolNote.text ?? ''), 'note text must not leak into HTML');
		});

		test('時限で隠れたノートは本文が HTML に含まれない', async () => {
			const html = await (await relativeFetch(`notes/${erinNote.id}`)).text();
			assert.ok(!html.includes(erinNote.text ?? ''), 'note text must not leak into HTML');
		});

		test('localOnly ノートは本文が HTML に含まれない', async () => {
			const html = await (await relativeFetch(`notes/${aliceLocalOnlyNote.id}`)).text();
			assert.ok(!html.includes(aliceLocalOnlyNote.text ?? ''), 'note text must not leak into HTML');
		});
	});

	describe('embed', () => {
		test('公開ノートは埋め込みに含まれる', async () => {
			const res = await relativeFetch(`embed/notes/${aliceNote.id}`);
			assert.strictEqual(res.status, 200);
			const html = await res.text();
			assert.ok(html.includes(aliceNote.text ?? ''), 'note text should be in embed HTML');
		});

		test('requireSigninToViewContents のノートは埋め込みに含まれない', async () => {
			const html = await (await relativeFetch(`embed/notes/${bobNote.id}`)).text();
			assert.ok(!html.includes(bobNote.text ?? ''), 'note text must not leak into embed HTML');
		});

		test('時限で隠れたノートは埋め込みに含まれない', async () => {
			const html = await (await relativeFetch(`embed/notes/${erinNote.id}`)).text();
			assert.ok(!html.includes(erinNote.text ?? ''), 'note text must not leak into embed HTML');
		});
	});
});
