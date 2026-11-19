/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { beforeAll, describe, test } from 'vitest';
import { api, castAsError, role, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('note role policies', () => {
	let root: misskey.entities.SignupResponse;

	beforeAll(async () => {
		// 最初のユーザーは root (管理者) になる
		root = await signup({ username: 'root_note_policy' });
	}, 1000 * 60 * 2);

	test('canHomeNote が無効な場合、public_non_ltl は followers まで降格される', async () => {
		const user = await signup({ username: 'can_home_note_false' });
		const createdRole = await role(root, { name: 'canHomeNoteFalse' }, {
			canPublicNote: { useDefault: false, priority: 0, value: true },
			canHomeNote: { useDefault: false, priority: 0, value: false },
			canPublicNonLtlNote: { useDefault: false, priority: 0, value: false },
		});

		await api('admin/roles/assign', { userId: user.id, roleId: createdRole.id }, root);
		await new Promise(x => setTimeout(x, 50));

		const res = await api('notes/create', {
			text: 'semi public note',
			visibility: 'public_non_ltl',
		}, user);

		assert.strictEqual(res.status, 200);
		assert.strictEqual(res.body!.createdNote.visibility, 'followers');

		await api('admin/roles/unassign', { userId: user.id, roleId: createdRole.id }, root);
		await api('admin/roles/delete', { roleId: createdRole.id }, root);
	});

	test('canUseMakePrivate が無効な場合、isScheduledForPrivate は拒否される', async () => {
		const user = await signup({ username: 'cannot_make_private' });
		const scheduledDelete = {
			deleteAt: Date.now() + 1000 * 60 * 60,
			isScheduledForPrivate: true,
		};

		const denied = await api('notes/create', {
			text: 'scheduled private note',
			scheduledDelete,
		}, user);

		assert.strictEqual(denied.status, 400);
		assert.strictEqual(castAsError(denied.body as Record<string, unknown>).error.code, 'CANNOT_USE_MAKE_PRIVATE');

		const createdRole = await role(root, { name: 'canMakePrivate' }, {
			canUseMakePrivate: { useDefault: false, priority: 0, value: true },
		});

		await api('admin/roles/assign', { userId: user.id, roleId: createdRole.id }, root);
		await new Promise(x => setTimeout(x, 50));

		const allowed = await api('notes/create', {
			text: 'scheduled private note',
			scheduledDelete,
		}, user);

		assert.strictEqual(allowed.status, 200);
		assert.ok(allowed.body!.createdNote.deleteAt);

		await api('admin/roles/unassign', { userId: user.id, roleId: createdRole.id }, root);
		await api('admin/roles/delete', { roleId: createdRole.id }, root);
	});
});
