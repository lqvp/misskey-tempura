/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { api, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

// #630 の設定 UI が前提とする18フラグについて、実サーバーで
// admin/meta への公開と admin/update-meta の往復(永続化)を確認する。
// allowAnonymousFeatured / allowAnonymousLocalTimeline は migration が
// entrance 系設定の現行値を引き継ぐ設計のため、スキーマ初期値の assert は行わず
// 「公開されていること」と「往復できること」のみを検証する。
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
	const original: Record<string, unknown> = {};

	beforeAll(async () => {
		// 最初のサインアップユーザーは管理者になる
		admin = await signup({ username: 'admin_anonflags' });
		// 共有DBの状態に依存しないよう、元の値を保存した上で全フラグを false に初期化する
		const meta = await api('admin/meta', {}, admin);
		const body = meta.body as Record<string, unknown>;
		for (const f of FLAGS) {
			assert.ok(f in body, `${f} が admin/meta に公開されているべき`);
			assert.strictEqual(typeof body[f], 'boolean', `${f} は boolean であるべき`);
			original[f] = body[f];
		}
		const um = await api('admin/update-meta', Object.fromEntries(FLAGS.map(f => [f, false])), admin);
		assert.strictEqual(um.status, 204, 'fixture の初期化に失敗');
	}, 1000 * 60 * 2);

	afterAll(async () => {
		// 初期化前の元の値に戻す(false 固定で上書きしない)
		await api('admin/update-meta', original, admin);
	});

	test('初期化後に18フラグが false として読める', async () => {
		const meta = await api('admin/meta', {}, admin);
		const body = meta.body as Record<string, unknown>;
		for (const f of FLAGS) {
			assert.strictEqual(body[f], false, `${f} は初期化した false のまま読めるべき`);
		}
	});

	test('update-meta で全フラグを on/off 往復できる', async () => {
		try {
			for (const f of FLAGS) {
				const um = await api('admin/update-meta', { [f]: true }, admin);
				assert.strictEqual(um.status, 204, `update-meta(on) ${f}`);
				const meta = await api('admin/meta', {}, admin);
				const body = meta.body as Record<string, unknown>;
				assert.strictEqual(body[f], true, `${f} が true として永続化されるべき`);
			}
			const um = await api('admin/update-meta', Object.fromEntries(FLAGS.map(f => [f, false])), admin);
			assert.strictEqual(um.status, 204, 'update-meta(off 一括)');
			const meta = await api('admin/meta', {}, admin);
			const body = meta.body as Record<string, unknown>;
			for (const f of FLAGS) {
				assert.strictEqual(body[f], false, `${f} が false に戻るべき`);
			}
		} finally {
			await api('admin/update-meta', original, admin);
		}
	});
});
