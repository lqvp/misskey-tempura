/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { describe, beforeAll, test } from 'vitest';
import { api, signup, castAsError } from '../utils.js';
import type * as misskey from 'misskey-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (path: string, params: any, me?: { token: string }) => (api as any)(path, params, me) as Promise<{ status: number; body: any }>;
const code = (res: { body: unknown }) => castAsError(res.body as Record<string, unknown>).error.code;

describe('sub-accounts: carry-over and concurrency', () => {
	let root: misskey.entities.SignupResponse;
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let sub: { id: string; token: string };

	const grant = async (user: { id: string }, limit: number) => {
		const role = await call('admin/roles/create', {
			name: `carry-${limit}-${user.id}`, description: '', color: null, iconUrl: null, displayOrder: 0,
			target: 'manual', condFormula: {}, permissionGroup: 'Normal', isPublic: false, isExplorable: false, asBadge: false,
			canEditMembersByModerator: false,
			policies: {
				canCreateSubAccount: { useDefault: false, priority: 0, value: true },
				subAccountLimit: { useDefault: false, priority: 0, value: limit },
			},
		}, root);
		assert.strictEqual(role.status, 200);
		const assign = await call('admin/roles/assign', { userId: user.id, roleId: role.body.id }, root);
		assert.strictEqual(assign.status, 204);
	};

	beforeAll(async () => {
		root = await signup({ username: 'carroot' });
		await call('admin/update-meta', { disableRegistration: false }, root);
		alice = await signup({ username: 'caralice' });
		bob = await signup({ username: 'carbob' });
		await grant(alice, 8);
		const c = await call('i/sub-accounts/create', { username: 'caralicesub' }, alice);
		assert.strictEqual(c.status, 200, JSON.stringify(c.body));
		const sw = await call('i/sub-accounts/switch', { subId: c.body.subAccount.id }, alice);
		sub = { id: c.body.subAccount.id, token: sw.body.token };
	}, 1000 * 60 * 2);

	test('probe: references are judged as the sub-account, not as the main account', async () => {
		const priv = await call('users/lists/create', { name: 'private' }, alice);
		const pub = await call('users/lists/create', { name: 'public' }, alice);
		await call('users/lists/update', { listId: pub.body.id, isPublic: true }, alice);
		const ant = await call('antennas/create', {
			name: 'ant', src: 'all', keywords: [['x']], excludeKeywords: [], users: [], caseSensitive: false,
			localOnly: false, withReplies: false, withFile: false, excludeBots: false, notify: false,
		}, alice);
		assert.strictEqual(ant.status, 200, JSON.stringify(ant.body));
		const folder = await call('drive/folders/create', { name: 'f' }, alice);

		const res = await call('i/sub-accounts/probe-references', {
			subId: sub.id,
			references: [
				{ type: 'list', id: priv.body.id },
				{ type: 'list', id: pub.body.id },
				{ type: 'antenna', id: ant.body.id },
				{ type: 'driveFolder', id: folder.body.id },
			],
		}, alice);
		assert.strictEqual(res.status, 200, JSON.stringify(res.body));
		assert.deepStrictEqual(res.body.usable, [{ type: 'list', id: pub.body.id }]);

		// not callable by the sub-account itself, nor by someone else's account
		assert.strictEqual((await call('i/sub-accounts/probe-references', { subId: sub.id, references: [] }, sub)).status, 403);
		const other = await call('i/sub-accounts/probe-references', { subId: sub.id, references: [] }, bob);
		assert.strictEqual(code(other), 'NO_SUCH_SUB_ACCOUNT');
	});

	test('initial settings: once, main-authenticated, never credentials', async () => {
		const scope = ['client', 'base'];
		const ok = [{ scope, key: 'defaultNoteVisibility', value: 'home' }, { scope: ['client', 'preferences', 'sync'], key: 'animation', value: [] }];

		assert.strictEqual((await call('i/sub-accounts/save-initial-settings', { subId: sub.id, items: ok }, sub)).status, 403);
		const other = await call('i/sub-accounts/save-initial-settings', { subId: sub.id, items: ok }, bob);
		assert.strictEqual(code(other), 'NO_SUCH_SUB_ACCOUNT');

		for (const bad of [
			[{ scope, key: 'accountTokens', value: {} }],
			[{ scope, key: 'geminiToken', value: 'x' }],
			[{ scope, key: 'memo', value: 'x' }],
			[{ scope: ['client', 'other'], key: 'k', value: 1 }],
			[{ scope: ['plugin'], key: 'k', value: 1 }],
		]) {
			const r = await call('i/sub-accounts/save-initial-settings', { subId: sub.id, items: bad }, alice);
			assert.strictEqual(code(r), 'INITIAL_SETTINGS_REJECTED', JSON.stringify(bad));
		}
		// nothing was written by the rejected calls, and they did not use up the window
		const none = await call('i/registry/get-all', { scope }, sub);
		assert.deepStrictEqual(none.body, {});
		// an unrelated registry write by the sub-account itself does not close the window either
		const own = await call('i/registry/set', { scope: ['client', 'other'], key: 'k', value: 1 }, sub);
		assert.strictEqual(own.status, 204, JSON.stringify(own.body));

		const saved = await call('i/sub-accounts/save-initial-settings', { subId: sub.id, items: ok }, alice);
		assert.strictEqual(saved.status, 200, JSON.stringify(saved.body));
		assert.strictEqual(saved.body.saved, 2);
		const got = await call('i/registry/get-all', { scope }, sub);
		assert.strictEqual(got.body.defaultNoteVisibility, 'home');
		// the main account's own registry is untouched
		const mine = await call('i/registry/get-all', { scope }, alice);
		assert.strictEqual(mine.body.defaultNoteVisibility, undefined);

		const again = await call('i/sub-accounts/save-initial-settings', { subId: sub.id, items: ok }, alice);
		assert.strictEqual(code(again), 'INITIAL_SETTINGS_CLOSED');
	});

	test('initial settings: concurrent saves, empty save and deleted sub-accounts', async () => {
		const mk = async (username: string) => {
			const c = await call('i/sub-accounts/create', { username }, alice);
			assert.strictEqual(c.status, 200, JSON.stringify(c.body));
			return c.body.subAccount.id as string;
		};
		const item = [{ scope: ['client', 'base'], key: 'defaultNoteVisibility', value: 'home' }];

		const a = await mk('caralicesub2');
		const rs = await Promise.all([1, 2, 3, 4].map(() => call('i/sub-accounts/save-initial-settings', { subId: a, items: item }, alice)));
		assert.strictEqual(rs.filter(r => r.status === 200).length, 1, JSON.stringify(rs.map(r => r.status)));
		for (const r of rs.filter(r => r.status !== 200)) assert.strictEqual(code(r), 'INITIAL_SETTINGS_CLOSED');

		// an empty save counts as the one-time use
		const b = await mk('caralicesub3');
		assert.strictEqual((await call('i/sub-accounts/save-initial-settings', { subId: b, items: [] }, alice)).status, 200);
		assert.strictEqual(code(await call('i/sub-accounts/save-initial-settings', { subId: b, items: item }, alice)), 'INITIAL_SETTINGS_CLOSED');

		// a deleted sub-account cannot be written to, and a new sub-account gets its own single use
		const c = await mk('caralicesub4');
		assert.strictEqual((await call('i/sub-accounts/delete', { subId: c }, alice)).status, 204);
		assert.strictEqual(code(await call('i/sub-accounts/save-initial-settings', { subId: c, items: item }, alice)), 'NO_SUCH_SUB_ACCOUNT');
	});

	test('a mid-write failure leaves no partial copy and the retry (also concurrent) succeeds exactly once', async () => {
		const c = await call('i/sub-accounts/create', { username: 'caralicesub9' }, alice);
		assert.strictEqual(c.status, 200, JSON.stringify(c.body));
		const id = c.body.subAccount.id as string;
		const sw = await call('i/sub-accounts/switch', { subId: id }, alice);
		const subTok = { token: sw.body.token as string };
		await call('i/registry/set', { scope: ['client', 'base'], key: 'defaultNoteVisibility', value: 'followers' }, subTok);
		const good = [
			{ scope: ['client', 'base'], key: 'defaultNoteVisibility', value: 'home' },
			{ scope: ['client', 'base'], key: 'defaultNoteLocalOnly', value: true },
		];
		// a NUL character cannot be stored in jsonb, so the third write fails after two succeeded
		const bad = [...good, { scope: ['client', 'base'], key: 'defaultNoteReactionAcceptance', value: 'a\u0000b' }];
		const f = await call('i/sub-accounts/save-initial-settings', { subId: id, items: bad }, alice);
		assert.notStrictEqual(f.status, 200);
		const after = await call('i/registry/get-all', { scope: ['client', 'base'] }, subTok);
		assert.deepStrictEqual(after.body, { defaultNoteVisibility: 'followers' }, JSON.stringify(after.body));
		const rs = await Promise.all([1, 2, 3].map(() => call('i/sub-accounts/save-initial-settings', { subId: id, items: good }, alice)));
		assert.strictEqual(rs.filter(r => r.status === 200).length, 1, JSON.stringify(rs.map(r => r.status)));
		const fin = await call('i/registry/get-all', { scope: ['client', 'base'] }, subTok);
		// the account's own earlier value is kept; only the missing key is copied
		assert.deepStrictEqual(fin.body, { defaultNoteVisibility: 'followers', defaultNoteLocalOnly: true });
	});

	test('concurrent creation never exceeds the limit', async () => {
		const carol = await signup({ username: 'carcarol' });
		await grant(carol, 2);
		const rs = await Promise.all(['carcarolsub1', 'carcarolsub2', 'carcarolsub3', 'carcarolsub4', 'carcarolsub5'].map(u => call('i/sub-accounts/create', { username: u }, carol)));
		assert.strictEqual(rs.filter(r => r.status === 200).length, 2, JSON.stringify(rs.map(r => r.status)));
		const list = await call('i/sub-accounts/list', {}, carol);
		assert.strictEqual(list.body.length, 2);
	});

	test('a parallel initial copy and the sub-account\'s own set of the same key leave exactly one row', async () => {
		const c = await call('i/sub-accounts/create', { username: 'carraceone' }, alice);
		assert.strictEqual(c.status, 200, JSON.stringify(c.body));
		const id = c.body.subAccount.id;
		const tok = (await call('i/sub-accounts/switch', { subId: id }, alice)).body.token;
		const subTok = { token: tok };
		const copy = [{ scope: ['client', 'base'], key: 'defaultNoteVisibility', value: 'home' }];
		const rs = await Promise.all([
			call('i/sub-accounts/save-initial-settings', { subId: id, items: copy }, alice),
			...[1, 2, 3, 4].map(n => call('i/registry/set', { scope: ['client', 'base'], key: 'defaultNoteVisibility', value: `own${n}` }, subTok)),
		]);
		for (const r of rs) assert.ok([200, 204].includes(r.status) || code(r) === 'INITIAL_SETTINGS_CLOSED', JSON.stringify(r.body));
		const all = await call('i/registry/get-all', { scope: ['client', 'base'] }, subTok);
		assert.strictEqual(Object.keys(all.body).filter(k => k === 'defaultNoteVisibility').length, 1);
		// the key list is built from rows, so a duplicated row would list the key twice
		const keys = await call('i/registry/keys', { scope: ['client', 'base'] }, subTok);
		assert.strictEqual((keys.body as string[]).filter(k => k === 'defaultNoteVisibility').length, 1, JSON.stringify(keys.body));
	});
});
