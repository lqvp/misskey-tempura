/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { beforeAll, describe, test } from 'vitest';
import { api, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

// #630 の設定 UI が前提とする18フラグが admin/meta に公開され、
// admin/update-meta で往復できること(実サーバー永続化)を確認する。
const FLAGS = [
	'allowAnonymousStats',
	'allowAnonymousOnlineUsersCount',
	'allowAnonymousChartActiveUsers',
	'allowAnonymousChartApRequest',
	'allowAnonymousChartDrive',
	'allowAnonymousChartFederation',
	'allowAnonymousChartInstance',
	'allowAnonymousChartNotes',
	'allowAnonymousChartUsers',
	'allowAnonymousFederationUsers',
	'allowAnonymousFederationInstances',
	'allowAnonymousFederationStats',
	'allowAnonymousShowInstance',
	'allowAnonymousReplies',
	'allowAnonymousRenotes',
	'allowAnonymousQuotes',
	'allowAnonymousFeatured',
	'allowAnonymousLocalTimeline',
] as const;

describe('admin/meta の匿名アクセスフラグ公開と update-meta 往復', () => {
	let admin: misskey.entities.SignupResponse;

	beforeAll(async () => {
		// 最初のサインアップユーザーは管理者になる
		admin = await signup({ username: 'admin_anonflags' });
	}, 1000 * 60 * 2);

	test('admin/meta が18フラグを初期値 false で公開する', async () => {
		const meta = await api('admin/meta', {}, admin);
		const body = meta.body as Record<string, unknown>;
		for (const f of FLAGS) {
			assert.strictEqual(body[f], false, `${f} は admin/meta に初期値 false で公開されるべき`);
		}
	});

	test('update-meta で全フラグを on/off 往復できる', async () => {
		for (const f of FLAGS) {
			const um = await api('admin/update-meta', { [f]: true }, admin);
			assert.strictEqual(um.status, 204, `update-meta(on) ${f}`);
			const meta = await api('admin/meta', {}, admin);
			const body = meta.body as Record<string, unknown>;
			assert.strictEqual(body[f], true, `${f} が true として永続化されるべき`);
		}
		for (const f of FLAGS) {
			const um = await api('admin/update-meta', { [f]: false }, admin);
			assert.strictEqual(um.status, 204, `update-meta(off) ${f}`);
		}
		const meta = await api('admin/meta', {}, admin);
		const body = meta.body as Record<string, unknown>;
		for (const f of FLAGS) {
			assert.strictEqual(body[f], false, `${f} が false に戻るべき`);
		}
	});
});
