/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { describe, beforeAll, test } from 'vitest';
import { api, signup, castAsError, relativeFetch } from '../utils.js';
import type * as misskey from 'misskey-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (path: string, params: any, me?: { token: string }) => (api as any)(path, params, me) as Promise<{ status: number; body: any }>;
const code = (res: { body: unknown }) => castAsError(res.body as Record<string, unknown>).error.code;

describe('sub-accounts: profile display of the relation', () => {
	let root: misskey.entities.SignupResponse;
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let sub1: { id: string; token: string; username: string };
	let sub2: { id: string; token: string; username: string };

	beforeAll(async () => {
		root = await signup({ username: 'disroot' });
		await call('admin/update-meta', { disableRegistration: false }, root);
		alice = await signup({ username: 'disalice' });
		bob = await signup({ username: 'disbob' });
		const role = await call('admin/roles/create', {
			name: 'dis', description: '', color: null, iconUrl: null, displayOrder: 0,
			target: 'manual', condFormula: {}, permissionGroup: 'Normal', isPublic: false, isExplorable: false, asBadge: false,
			canEditMembersByModerator: false,
			policies: {
				canCreateSubAccount: { useDefault: false, priority: 0, value: true },
				subAccountLimit: { useDefault: false, priority: 0, value: 3 },
			},
		}, root);
		await call('admin/roles/assign', { userId: alice.id, roleId: role.body.id }, root);
		const made: { id: string; token: string; username: string }[] = [];
		for (const username of ['disalicesub1', 'disalicesub2']) {
			const c = await call('i/sub-accounts/create', { username }, alice);
			assert.strictEqual(c.status, 200, JSON.stringify(c.body));
			const sw = await call('i/sub-accounts/switch', { subId: c.body.subAccount.id }, alice);
			made.push({ id: c.body.subAccount.id, token: sw.body.token, username });
		}
		[sub1, sub2] = made;
	}, 1000 * 60 * 2);

	const show = async (id: string, as?: { token: string }) => (await call('users/show', { userId: id }, as)).body;

	test('both directions are hidden by default', async () => {
		assert.strictEqual((await show(sub1.id, bob)).parentAccount, undefined);
		assert.strictEqual((await show(alice.id, bob)).subAccounts, undefined);
		const me = await call('i', {}, sub1);
		assert.strictEqual(me.body.isSubAccount, true);
		assert.strictEqual(me.body.showParentOnProfile, false);
		assert.strictEqual(me.body.showSubOnProfile, false);
		assert.strictEqual((await call('i', {}, alice)).body.isSubAccount, false);
	});

	test('while hidden, the relation keys are absent from the response for third parties, anonymous callers, the owner and an admin', async () => {
		const viewers: [string, { token: string } | undefined][] = [['third party', bob], ['anonymous', undefined], ['owner', alice], ['sub itself', sub1], ['admin', root]];
		for (const [label, who] of viewers) {
			for (const id of [sub1.id, alice.id]) {
				const r = await call('users/show', { userId: id }, who);
				const text = JSON.stringify(r.body);
				assert.ok(!('parentAccount' in r.body) && !('subAccounts' in r.body), `${label}: key present for ${id}: ${r.status}`);
				assert.ok(!text.includes('disalicesub') || id !== alice.id, `${label}: sub name leaked via ${id}`);
				if (id === sub1.id) assert.ok(!text.includes(`"${alice.id}"`) || r.status !== 200 || r.body.id === alice.id, `${label}: parent id leaked`);
			}
		}
	});

	test('a sub-account can show its parent, independently of the other direction and of other subs', async () => {
		const r = await call('i/sub-accounts/update-display', { showParentOnProfile: true }, sub1);
		assert.strictEqual(r.status, 204, JSON.stringify(r.body));
		assert.strictEqual((await show(sub1.id, bob)).parentAccount?.id, alice.id);
		assert.strictEqual((await show(sub2.id, bob)).parentAccount, undefined);
		assert.strictEqual((await show(alice.id, bob)).subAccounts, undefined);
	});

	test('the main account can list a sub-account on its profile; other people cannot change anything', async () => {
		const r = await call('i/sub-accounts/update-display', { subId: sub2.id, showSubOnProfile: true }, alice);
		assert.strictEqual(r.status, 204, JSON.stringify(r.body));
		const subs = (await show(alice.id, bob)).subAccounts;
		assert.deepStrictEqual(subs.map((x: { id: string }) => x.id), [sub2.id]);
		assert.strictEqual((await show(sub2.id, bob)).parentAccount, undefined);

		const other = await call('i/sub-accounts/update-display', { subId: sub1.id, showParentOnProfile: false }, bob);
		assert.strictEqual(code(other), 'NO_SUCH_SUB_ACCOUNT');
		// a sub-account cannot change its sibling
		const sib = await call('i/sub-accounts/update-display', { subId: sub2.id, showParentOnProfile: true }, sub1);
		assert.strictEqual(code(sib), 'NO_SUCH_SUB_ACCOUNT');
		assert.strictEqual((await show(sub2.id, bob)).parentAccount, undefined);

		// hiding again works
		await call('i/sub-accounts/update-display', { subId: sub2.id, showSubOnProfile: false }, alice);
		assert.strictEqual((await show(alice.id, bob)).subAccounts, undefined);
	});

	test('the relation never appears in ActivityPub, WebFinger, NodeInfo or the feeds, even when both flags are on', async () => {
		// anonymous ActivityPub and WebFinger are refused unless federation is on
		assert.strictEqual((await call('admin/update-meta', { federation: 'all' }, root)).status, 204);
		for (const [id, show] of [[sub1.id, true], [sub2.id, true]] as const) {
			await call('i/sub-accounts/update-display', { subId: id, showParentOnProfile: show, showSubOnProfile: show }, alice);
		}
		// the profile API does show the relation now, so the checks below are not vacuous
		assert.strictEqual((await show(sub1.id, bob)).parentAccount?.id, alice.id);
		assert.ok((await show(alice.id, bob)).subAccounts.length === 2);

		// Fork spec: every new account (sub-accounts included) requires sign-in to view its contents by default,
		// so an anonymous feed is closed (404). It only opens when the account itself turns that off.
		assert.strictEqual((await relativeFetch(`@${sub1.username}.atom`)).status, 404);
		assert.strictEqual((await call('i/update', { requireSigninToViewContents: false }, sub1)).status, 200);

		const host = new URL('http://misskey.local').host;
		const get = async (path: string, accept?: string) => {
			const r = await relativeFetch(path, accept ? { headers: { Accept: accept } } : undefined);
			return { status: r.status, text: await r.text() };
		};
		const checks: [string, string, string[], string[]][] = [
			// [path, accept, must contain, must not contain]
			[`users/${sub1.id}`, 'application/activity+json', [sub1.username], ['disalice"', `users/${alice.id}`, '"disalice"', 'disalice@']],
			[`users/${alice.id}`, 'application/activity+json', ['disalice'], ['disalicesub']],
			[`.well-known/webfinger?resource=acct:${sub1.username}@${host}`, '', [sub1.username], ['acct:disalice@', `users/${alice.id}`]],
			[`.well-known/webfinger?resource=acct:disalice@${host}`, '', ['disalice'], ['disalicesub']],
			[`@${sub1.username}.atom`, '', [sub1.username], ['acct:disalice@', '@disalice<', 'disalice@misskey']],
			[`@disalice.atom`, '', ['disalice'], ['disalicesub']],
			['nodeinfo/2.1', '', ['software'], ['disalice']],
		];
		for (const [path, accept, must, mustNot] of checks) {
			const r = await get(path, accept || undefined);
			assert.strictEqual(r.status, 200, `${path}: ${r.status}`);
			for (const m of must) assert.ok(r.text.includes(m), `${path} should contain ${m}`);
			for (const m of mustNot) assert.ok(!r.text.includes(m), `${path} must not contain ${m}`);
		}
	});
});
