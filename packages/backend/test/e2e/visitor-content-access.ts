/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { afterEach, beforeAll, beforeEach, describe, test } from 'vitest';
import { MiUser, MiUserProfile } from '@/models/_.js';
import { api, castAsError, initTestDb, post, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

// Pages / Clips / Channels / ユーザー検索の匿名アクセスは、訪問者への公開範囲
// (ugcVisibilityForVisitor) に従うこと。
// - 'none' の間は匿名には返さない(ノート・users/show・ActivityPub と同じ扱い)
// - 'local' の間は匿名のユーザー検索はローカルユーザーに限定する
// - 'all' では従来どおり匿名でも取得できる
// ノート系は共有述語で既にカバーされているが、Pages/Clips/Channels/ユーザー検索は
// カバーされていなかったための回帰テスト。
describe('visitor content access floor (pages/clips/channels/user search)', () => {
	let admin: misskey.entities.SignupResponse;
	let localUser: misskey.entities.SignupResponse;
	let pageId: string;
	let clipId: string;
	let channelId: string;

	const REMOTE_HOST = 'vcontent.example';

	// テスト失敗時に公開範囲が残って後続ファイルに波及しないよう毎回戻す
	afterEach(async () => {
		await api('admin/update-meta', { ugcVisibilityForVisitor: 'all' }, admin);
	});

	beforeAll(async () => {
		const db = await initTestDb(true);
		// 最初のサインアップユーザーは管理者になる
		admin = await signup({ username: 'admin_vca' });
		localUser = await signup({ username: 'vscanlocal' });

		// ユーザー検索の 'local' 限定を確認するためのリモートユーザー
		await db.getRepository(MiUser).insert({
			id: 'vscanremote0001',
			username: 'vscanremote',
			usernameLower: 'vscanremote',
			host: REMOTE_HOST,
			uri: `https://${REMOTE_HOST}/users/vscanremote`,
			inbox: `https://${REMOTE_HOST}/users/vscanremote/inbox`,
			sharedInbox: `https://${REMOTE_HOST}/inbox`,
		});
		// pack(UserDetailed) がプロフィールを参照するため併せて登録する
		await db.getRepository(MiUserProfile).insert({
			userId: 'vscanremote0001',
		});
		await db.destroy();

		const page = await api('pages/create', {
			title: 'visitor floor page',
			name: 'visitorfloorpage',
			content: [],
			variables: [],
			script: '',
		}, admin);
		assert.strictEqual(page.status, 200, JSON.stringify(page.body));
		pageId = page.body.id;
		// pages/featured は likedCount > 0 が条件のためいいねしておく
		const like = await api('pages/like', { pageId }, localUser); // 自分のページはいいねできないので別ユーザーで
		assert.strictEqual(like.status, 204, JSON.stringify(like.body));

		const clip = await api('clips/create', { name: 'visitor floor clip', isPublic: true }, admin);
		assert.strictEqual(clip.status, 200, JSON.stringify(clip.body));
		clipId = clip.body.id;
		const note = await post(admin, { text: 'clip note' });
		const addNote = await api('clips/add-note', { clipId, noteId: note.id }, admin);
		assert.strictEqual(addNote.status, 204, JSON.stringify(addNote.body));

		const channel = await api('channels/create', { name: 'visitor floor channel' }, admin);
		assert.strictEqual(channel.status, 200, JSON.stringify(channel.body));
		channelId = channel.body.id;
		// channels/featured は lastNotedAt IS NOT NULL が条件のため投稿しておく
		await post(admin, { text: 'channel note', channelId });
	}, 1000 * 60 * 2);

	describe("'all' では従来どおり匿名でも取得できる", () => {
		// 他ファイルの後始末や並び順に依存しないよう、このブロックでも明示的に 'all' にする
		beforeEach(async () => {
			await api('admin/update-meta', { ugcVisibilityForVisitor: 'all' }, admin);
		});

		test('pages/show・pages/featured', async () => {
			const res = await api('pages/show', { pageId });
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.id, pageId);
			const featured = await api('pages/featured', {});
			assert.strictEqual(featured.status, 200);
			assert.ok(featured.body.some((p: { id: string }) => p.id === pageId));
		});

		test('clips/show・clips/notes', async () => {
			const res = await api('clips/show', { clipId });
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.id, clipId);
			const notes = await api('clips/notes', { clipId });
			assert.strictEqual(notes.status, 200);
			assert.strictEqual(notes.body.length, 1);
		});

		test('channels/show・channels/featured', async () => {
			const res = await api('channels/show', { channelId });
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.id, channelId);
			const featured = await api('channels/featured', {});
			assert.strictEqual(featured.status, 200);
			assert.ok(featured.body.some((c: { id: string }) => c.id === channelId));
		});

		test('users/search はローカル・リモート両方を返す', async () => {
			const res = await api('users/search', { query: 'vscan', detail: false });
			assert.strictEqual(res.status, 200);
			const usernames = res.body.map((u: { username: string }) => u.username);
			assert.ok(usernames.includes('vscanlocal'), JSON.stringify(usernames));
			assert.ok(usernames.includes('vscanremote'), JSON.stringify(usernames));
		});
	});

	describe("'none' の間は匿名には返さない", () => {
		test('pages/clips/channels/users/search のすべてが匿名には返らない', async () => {
			await api('admin/update-meta', { ugcVisibilityForVisitor: 'none' }, admin);
			try {
				const page = await api('pages/show', { pageId });
				assert.strictEqual(page.status, 400);
				assert.strictEqual(castAsError(page.body as any).error.code, 'NO_SUCH_PAGE');
				const pagesFeatured = await api('pages/featured', {});
				assert.deepStrictEqual(pagesFeatured.body, []);

				const clip = await api('clips/show', { clipId });
				assert.strictEqual(clip.status, 400);
				assert.strictEqual(castAsError(clip.body as any).error.code, 'NO_SUCH_CLIP');
				const clipNotes = await api('clips/notes', { clipId });
				assert.strictEqual(clipNotes.status, 400);
				assert.strictEqual(castAsError(clipNotes.body as any).error.code, 'NO_SUCH_CLIP');

				const channel = await api('channels/show', { channelId });
				assert.strictEqual(channel.status, 400);
				assert.strictEqual(castAsError(channel.body as any).error.code, 'NO_SUCH_CHANNEL');
				const channelsFeatured = await api('channels/featured', {});
				assert.deepStrictEqual(channelsFeatured.body, []);

				const search = await api('users/search', { query: 'vscan', detail: false });
				assert.deepStrictEqual(search.body, []);
			} finally {
				await api('admin/update-meta', { ugcVisibilityForVisitor: 'all' }, admin);
			}
		});

		test("ログイン済みは 'none' でも従来どおり取得できる", async () => {
			await api('admin/update-meta', { ugcVisibilityForVisitor: 'none' }, admin);
			try {
				const page = await api('pages/show', { pageId }, localUser);
				assert.strictEqual(page.status, 200);
				const clip = await api('clips/show', { clipId }, localUser);
				assert.strictEqual(clip.status, 200);
				const channel = await api('channels/show', { channelId }, localUser);
				assert.strictEqual(channel.status, 200);
				const search = await api('users/search', { query: 'vscan', detail: false }, localUser);
				assert.strictEqual(search.status, 200);
				assert.ok(search.body.length >= 2, JSON.stringify(search.body));
			} finally {
				await api('admin/update-meta', { ugcVisibilityForVisitor: 'all' }, admin);
			}
		});
	});

	describe("'local' の間は匿名のユーザー検索がローカルに限定される", () => {
		test('リモートユーザーは匿名の検索結果に出ない', async () => {
			await api('admin/update-meta', { ugcVisibilityForVisitor: 'local' }, admin);
			try {
				const res = await api('users/search', { query: 'vscan', detail: false });
				assert.strictEqual(res.status, 200);
				const usernames = res.body.map((u: { username: string }) => u.username);
				assert.ok(usernames.includes('vscanlocal'), JSON.stringify(usernames));
				assert.ok(!usernames.includes('vscanremote'), JSON.stringify(usernames));
			} finally {
				await api('admin/update-meta', { ugcVisibilityForVisitor: 'all' }, admin);
			}
		});

		test('origin: remote を指定した匿名検索は空を返す(ローカル結果への置き換えをしない)', async () => {
			await api('admin/update-meta', { ugcVisibilityForVisitor: 'local' }, admin);
			try {
				const res = await api('users/search', { query: 'vscan', origin: 'remote', detail: false });
				assert.strictEqual(res.status, 200);
				assert.deepStrictEqual(res.body, []);
			} finally {
				await api('admin/update-meta', { ugcVisibilityForVisitor: 'all' }, admin);
			}
		});
	});
});
