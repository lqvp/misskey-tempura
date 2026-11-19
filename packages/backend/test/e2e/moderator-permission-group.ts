/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { beforeAll, describe, test } from 'vitest';
import { api, failedApiCall, role, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('Moderator permission group (サブモデレーター階級)', () => {
	let root: misskey.entities.SignupResponse;
	let subModerator: misskey.entities.SignupResponse;

	beforeAll(async () => {
		root = await signup({ username: 'root' });
		subModerator = await signup({ username: 'submod' });

		// Moderator (サブモデレーター) ロールを作成してアサイン
		const roleModerator = await role(root, { permissionGroup: 'Moderator', name: 'Sub Moderator Role' });
		await api('admin/roles/assign', { userId: subModerator.id, roleId: roleModerator.id }, root);
	}, 1000 * 60 * 2);

	test('サブモデレーターは requireSubModerator エンドポイント (admin/abuse-user-reports) を利用できる', async () => {
		const res = await api('admin/abuse-user-reports', { limit: 10 }, subModerator);
		assert.strictEqual(res.status, 200);
	});

	test('サブモデレーターは requireSubModerator エンドポイント (admin/show-users) を利用できる', async () => {
		const res = await api('admin/show-users', { limit: 10 }, subModerator);
		assert.strictEqual(res.status, 200);
	});

	test('サブモデレーターは requireModerator エンドポイント (admin/announcements/list) を利用できない', async () => {
		await failedApiCall({
			endpoint: 'admin/announcements/list',
			parameters: { limit: 10 },
			user: subModerator,
		}, {
			status: 403,
			code: 'ROLE_PERMISSION_DENIED',
			id: 'd33d5333-db36-423d-a8f9-1a2b9549da41',
		});
	});

	test('サブモデレーターは requireAdmin エンドポイント (admin/update-meta) を利用できない', async () => {
		await failedApiCall({
			endpoint: 'admin/update-meta',
			parameters: {},
			user: subModerator,
		}, {
			status: 403,
			code: 'ROLE_PERMISSION_DENIED',
			id: 'c3d38592-54c0-429d-be96-5636b0431a61',
		});
	});

	test('サブモデレーターは isModerator として扱われる (admin/emoji/list は canManageCustomEmojis ポリシーで判定)', async () => {
		// canManageCustomEmojis を付与した Moderator ロールで絵文字管理エンドポイントが使える
		const roleEmoji = await role(root, {
			permissionGroup: 'Moderator',
			name: 'Sub Moderator Emoji Role',
		}, {
			canManageCustomEmojis: { priority: 1, useDefault: false, value: true },
		});
		const emojiModerator = await signup({ username: 'emojimod' });
		await api('admin/roles/assign', { userId: emojiModerator.id, roleId: roleEmoji.id }, root);

		const res = await api('admin/emoji/list', { limit: 10 }, emojiModerator);
		assert.strictEqual(res.status, 200);
	});
});
