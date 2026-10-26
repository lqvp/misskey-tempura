/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, beforeAll, test } from 'vitest';
import { api, signup, castAsError, connectStream, createAppToken } from '../utils.js';
import type * as misskey from 'misskey-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (path: string, params: any, me?: { token: string }) => (api as any)(path, params, me) as Promise<{ status: number; body: any }>;
const code = (res: { body: unknown }) => castAsError(res.body as Record<string, unknown>).error.code;

describe('sub-accounts', () => {
	let root: misskey.entities.SignupResponse;
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;

	const grant = async (user: { id: string }, limit: number) => {
		const role = await call('admin/roles/create', {
			name: `sub-${limit}-${user.id}`, description: '', color: null, iconUrl: null, displayOrder: 0,
			target: 'manual', condFormula: {}, permissionGroup: 'Normal', isPublic: false, isExplorable: false, asBadge: false,
			canEditMembersByModerator: false,
			policies: {
				canCreateSubAccount: { useDefault: false, priority: 0, value: true },
				subAccountLimit: { useDefault: false, priority: 0, value: limit },
			},
		}, root);
		assert.strictEqual(res200(role), true);
		const assign = await call('admin/roles/assign', { userId: user.id, roleId: role.body.id }, root);
		assert.strictEqual(assign.status, 204);
		return role.body.id as string;
	};
	const res200 = (r: { status: number }) => r.status === 200;

	beforeAll(async () => {
		root = await signup({ username: 'subroot' });
		await call('admin/update-meta', { disableRegistration: false }, root);
		alice = await signup({ username: 'subalice' });
		bob = await signup({ username: 'subbob' });
		await grant(alice, 2);
	}, 1000 * 60 * 2);

	test('a user without the role cannot create sub-accounts', async () => {
		const preview = await call('i/sub-accounts/create-preview', {}, bob);
		assert.strictEqual(preview.status, 200);
		assert.strictEqual(preview.body.canCreate, false);
		assert.strictEqual(preview.body.reason, 'NOT_ALLOWED');
		const res = await call('i/sub-accounts/create', { username: 'bobsub' }, bob);
		assert.strictEqual(res.status, 400);
		assert.strictEqual(code(res), 'NOT_ALLOWED');
	});

	test('create, list, switch, limit, and sub restrictions', async () => {
		const preview = await call('i/sub-accounts/create-preview', {}, alice);
		assert.strictEqual(preview.body.canCreate, true, JSON.stringify(preview.body));
		assert.strictEqual(preview.body.limit, 2);

		const c1 = await call('i/sub-accounts/create', { username: 'alicesub1' }, alice);
		assert.strictEqual(c1.status, 200, JSON.stringify(c1.body));
		assert.strictEqual(c1.body.subAccount.username, 'alicesub1');
		const c2 = await call('i/sub-accounts/create', { username: 'alicesub2' }, alice);
		assert.strictEqual(c2.status, 200);
		const c3 = await call('i/sub-accounts/create', { username: 'alicesub3' }, alice);
		assert.strictEqual(c3.status, 400);
		assert.strictEqual(code(c3), 'LIMIT_REACHED');

		const dup = await call('i/sub-accounts/create', { username: 'subbob' }, alice);
		assert.notStrictEqual(dup.status, 200);

		const list = await call('i/sub-accounts/list', {}, alice);
		assert.strictEqual(list.body.length, 2);

		const sw = await call('i/sub-accounts/switch', { subId: c1.body.subAccount.id }, alice);
		assert.strictEqual(sw.status, 200);
		const sub = { token: sw.body.token as string };
		const me = await call('i', {}, sub);
		assert.strictEqual(me.status, 200);
		assert.strictEqual(me.body.id, c1.body.subAccount.id);

		// a sub-account cannot manage sub-accounts, nor touch credentials
		for (const ep of ['i/sub-accounts/create-preview', 'i/sub-accounts/list']) {
			const r = await call(ep, {}, sub);
			assert.strictEqual(r.status, 403, ep);
		}
		for (const ep of ['i/change-password', 'i/update-email', 'i/regenerate-token', 'i/delete-account', 'i/2fa/register']) {
			const r = await call(ep, { password: 'x', currentPassword: 'x', newPassword: 'y' }, sub);
			assert.strictEqual(r.status, 403, ep);
			assert.strictEqual(code(r), 'DENIED_FOR_SUB_ACCOUNT', ep);
		}
		const signin = await call('signin-flow', { username: 'alicesub1', password: '' });
		assert.notStrictEqual(signin.status, 200);

		// a sub cannot switch into another account's sub
		const other = await call('i/sub-accounts/switch', { subId: c1.body.subAccount.id }, bob);
		assert.strictEqual(other.status, 400);
		assert.strictEqual(code(other), 'NO_SUCH_SUB_ACCOUNT');

		// sub-account with the admin role still cannot act on its parent/sibling
		const adminRole = await call('admin/roles/create', {
			name: 'subadmin', description: '', color: null, iconUrl: null, displayOrder: 0,
			target: 'manual', condFormula: {}, permissionGroup: 'Admin', isPublic: false, isExplorable: false, asBadge: false,
			canEditMembersByModerator: false, policies: {},
		}, root);
		assert.strictEqual(adminRole.status, 200);
		await call('admin/roles/assign', { userId: c1.body.subAccount.id, roleId: adminRole.body.id }, root);
		const susParent = await call('admin/suspend-user', { userId: alice.id }, sub);
		assert.strictEqual(susParent.status, 403);
		assert.strictEqual(code(susParent), 'DENIED_FOR_SUB_ACCOUNT_FAMILY');
		const susSibling = await call('admin/suspend-user', { userId: c2.body.subAccount.id }, sub);
		assert.strictEqual(susSibling.status, 403);
		const selfDelete = await call('admin/delete-account', { userId: c1.body.subAccount.id }, sub);
		assert.strictEqual(selfDelete.status, 403);
		const meta = await call('admin/update-meta', { disableRegistration: false }, sub);
		assert.strictEqual(meta.status, 403);
		const metaOk = await call('admin/update-meta', { themeColor: '#123456' }, sub);
		assert.strictEqual(metaOk.status, 204, JSON.stringify(metaOk.body));
		const reset = await call('admin/reset-password', { userId: c2.body.subAccount.id }, root);
		assert.strictEqual(reset.status, 400);

		// the main account regenerating its token revokes sub-account tokens
		const regen = await call('i/regenerate-token', { password: 'test' }, alice);
		assert.strictEqual(regen.status, 204);
		const after = await call('i', {}, sub);
		assert.strictEqual(after.status, 401);
	});

	test('suspending the main account suspends its sub-accounts', async () => {
		const dave = await signup({ username: 'subdave' });
		await grant(dave, 1);
		const c = await call('i/sub-accounts/create', { username: 'davesub1' }, dave);
		const sw = await call('i/sub-accounts/switch', { subId: c.body.subAccount.id }, dave);
		const sub = { token: sw.body.token as string };
		assert.strictEqual((await call('i', {}, sub)).status, 200);

		await call('admin/suspend-user', { userId: dave.id }, root);
		await sleep(500);
		assert.notStrictEqual((await call('i', {}, sub)).status, 200);
		const blocked = await call('i/sub-accounts/switch', { subId: c.body.subAccount.id }, dave);
		assert.notStrictEqual(blocked.status, 200);

		await call('admin/unsuspend-user', { userId: dave.id }, root);
		await sleep(500);
		assert.strictEqual((await call('i', {}, sub)).status, 200);
	});

	test('deleting the main account deletes its sub-accounts (and a retry-safe order)', async () => {
		const erin = await signup({ username: 'suberin' });
		await grant(erin, 2);
		const a = await call('i/sub-accounts/create', { username: 'erinsub1' }, erin);
		const b = await call('i/sub-accounts/create', { username: 'erinsub2' }, erin);
		assert.strictEqual(a.status, 200);
		assert.strictEqual(b.status, 200);
		const sws = await Promise.all([a, b].map(x => call('i/sub-accounts/switch', { subId: x.body.subAccount.id }, erin)));
		const subTokens = sws.map(x => ({ token: x.body.token as string }));
		for (const t of subTokens) assert.strictEqual((await call('i', {}, t)).status, 200);
		const del = await call('admin/delete-account', { userId: erin.id }, root);
		assert.strictEqual(del.status, 204);
		// sub-accounts are marked deleted and their tokens stop working
		for (const t of subTokens) {
			let status = 200;
			for (let i = 0; i < 40 && status === 200; i++) {
				status = (await call('i', {}, t)).status;
				if (status === 200) await sleep(250);
			}
			assert.strictEqual(status, 401);
		}
	});

	test('a sub-account can be deleted by its main account only', async () => {
		const frank = await signup({ username: 'subfrank' });
		await grant(frank, 1);
		const c = await call('i/sub-accounts/create', { username: 'franksub1' }, frank);
		const del = await call('i/sub-accounts/delete', { subId: c.body.subAccount.id }, frank);
		assert.strictEqual(del.status, 204);
		for (let i = 0; i < 6; i++) {
			const r = await call('admin/show-user', { userId: c.body.subAccount.id }, root);
			if (r.status !== 200) break;
			await sleep(500);
		}
		const list = await call('i/sub-accounts/list', {}, frank);
		assert.strictEqual(list.body.length, 0);
	});
	test('parent suspension drops a sub Streaming session; unsuspending a sub alone keeps it suspended while the parent is suspended', async () => {
		const gina = await signup({ username: 'subgina' });
		await grant(gina, 1);
		const c = await call('i/sub-accounts/create', { username: 'ginasub1' }, gina);
		const subId = c.body.subAccount.id as string;
		const sw = await call('i/sub-accounts/switch', { subId }, gina);
		const sub = { token: sw.body.token as string };
		const ws = await connectStream(sub as any, 'main', () => {});
		const closed = new Promise<void>(resolve => ws.on('close', () => resolve()));

		await call('admin/suspend-user', { userId: gina.id }, root);
		await Promise.race([closed, sleep(5000).then(() => { throw new Error('sub Streaming session was not disconnected'); })]);

		// the sub is asked to be unsuspended on its own while the parent is still suspended: the effective state stays suspended
		await call('admin/unsuspend-user', { userId: subId }, root);
		await sleep(500);
		assert.notStrictEqual((await call('i', {}, sub)).status, 200);

		await call('admin/unsuspend-user', { userId: gina.id }, root);
		await sleep(500);
		assert.strictEqual((await call('i', {}, sub)).status, 200);
	});

	test('admin token regeneration of a sub-account revokes the old token and the main account can fetch the new one', async () => {
		const hank = await signup({ username: 'subhank' });
		await grant(hank, 1);
		const c = await call('i/sub-accounts/create', { username: 'hanksub1' }, hank);
		const subId = c.body.subAccount.id as string;
		const sw = await call('i/sub-accounts/switch', { subId }, hank);
		const sub = { token: sw.body.token as string };
		const r = await call('admin/regenerate-user-token', { userId: subId }, root);
		assert.strictEqual(r.status, 204);
		await sleep(500);
		assert.notStrictEqual((await call('i', {}, sub)).status, 200);
		const after = await call('i/sub-accounts/switch', { subId }, hank);
		assert.strictEqual(after.status, 200);
		assert.notStrictEqual(after.body.token, sub.token);
	});

	test('creating a sub-account while the main account is being deleted never leaves a surviving sub-account', async () => {
		const ivy = await signup({ username: 'subivy' });
		await grant(ivy, 2);
		const results = await Promise.all([
			call('admin/delete-account', { userId: ivy.id }, root),
			call('i/sub-accounts/create', { username: 'ivysub1' }, ivy),
			call('i/sub-accounts/create', { username: 'ivysub2' }, ivy),
		]);
		assert.strictEqual(results[0].status, 204);
		await sleep(1500);
		for (const name of ['ivysub1', 'ivysub2']) {
			const u = await api('users/show', { username: name }, root);
			if (u.status !== 200) continue;
			const full = await call('admin/show-user', { userId: u.body.id }, root);
			assert.strictEqual(full.status === 200 ? full.body.isDeleted : true, true);
		}
	});
	test('API keys of a sub-account are rejected after main regenerate-token, sub regenerate and admin regeneration', async () => {
		const jane = await signup({ username: 'subjane' });
		await grant(jane, 2);
		const mk = async (name: string) => {
			const c = await call('i/sub-accounts/create', { username: name }, jane);
			assert.strictEqual(c.status, 200);
			const subId = c.body.subAccount.id as string;
			const sw = await call('i/sub-accounts/switch', { subId }, jane);
			const sub = { token: sw.body.token as string };
			const apiKey = await createAppToken(sub as any, ['read:account']);
			assert.strictEqual((await call('i', {}, { token: apiKey })).status, 200);
			return { subId, sub, apiKey };
		};
		const waitRejected = async (token: string) => {
			let status = 200;
			for (let i = 0; i < 20 && status === 200; i++) {
				status = (await call('i', {}, { token })).status;
				if (status === 200) await sleep(250);
			}
			return status;
		};

		// 1. the main account regenerates one sub-account
		const a = await mk('janesub1');
		assert.strictEqual((await call('i/sub-accounts/regenerate-token', { subId: a.subId }, jane)).status, 204);
		assert.notStrictEqual(await waitRejected(a.apiKey), 200);
		assert.notStrictEqual((await call('i', {}, a.sub)).status, 200);

		// 2. an administrator regenerates a sub-account token
		const b = await mk('janesub2');
		assert.strictEqual((await call('admin/regenerate-user-token', { userId: b.subId }, root)).status, 204);
		assert.notStrictEqual(await waitRejected(b.apiKey), 200);
		const again = await call('i/sub-accounts/switch', { subId: b.subId }, jane);
		assert.strictEqual(again.status, 200);
		assert.strictEqual((await call('i', {}, { token: again.body.token })).status, 200);

		// 3. the main account regenerates its own token: every sub-account credential stops working, API keys included
		const c2 = await call('i/sub-accounts/switch', { subId: a.subId }, jane);
		const key3 = await createAppToken({ token: c2.body.token } as any, ['read:account']);
		assert.strictEqual((await call('i', {}, { token: key3 })).status, 200);
		const reg = await call('i/regenerate-token', { password: 'test' }, jane);
		assert.strictEqual(reg.status, 204);
		assert.notStrictEqual(await waitRejected(key3), 200);
		assert.notStrictEqual(await waitRejected(again.body.token), 200);
	});
});
