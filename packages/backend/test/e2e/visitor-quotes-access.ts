/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { MiNote, MiUser, MiUserProfile } from '@/models/_.js';
import { api, initTestDb, post, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

// notes/quotes の匿名応答には、公開範囲フィルターだけでなく共通ノートフィルター
// (停止ユーザー・ブロックホストの除外)も適用されること。
// allowAnonymousQuotes で匿名に開放しても、replies/renotes など他の一覧と同じ
// 安全性フィルターが欠けていてはいけない。
describe('visitor quotes filtering', () => {
	let admin: misskey.entities.SignupResponse;
	let quoter: misskey.entities.SignupResponse;
	let target: misskey.entities.Note;
	let visibleQuote: misskey.entities.Note;
	let remoteQuoteId: string;

	const REMOTE_HOST = 'quotesremote.example';

	const fetchAnonymousQuoteIds = async () => {
		const res = await api('notes/quotes', { noteId: target.id });
		assert.strictEqual(res.status, 200);
		return (res.body as misskey.entities.Note[]).map(n => n.id);
	};

	beforeAll(async () => {
		const db = await initTestDb(true);
		// 最初のサインアップユーザーは管理者になる
		admin = await signup({ username: 'admin_quotes' });
		quoter = await signup({ username: 'quoteslocal' });

		target = await post(admin, { text: 'quotes target' });
		visibleQuote = await post(quoter, { text: 'visible quote', renoteId: target.id });

		// ブロックホスト判定用のリモート著者の引用。
		// いったんローカルで投稿してから著者をリモートユーザーに差し替える
		const remoteQuote = await post(quoter, { text: 'remote quote', renoteId: target.id });
		remoteQuoteId = remoteQuote.id;
		await db.getRepository(MiUser).insert({
			id: 'quotesremoteuser01',
			username: 'quotesremote',
			usernameLower: 'quotesremote',
			host: REMOTE_HOST,
			uri: `https://${REMOTE_HOST}/users/quotesremote`,
			inbox: `https://${REMOTE_HOST}/users/quotesremote/inbox`,
			sharedInbox: `https://${REMOTE_HOST}/inbox`,
		});
		// pack(Note) が著者プロフィールを参照するため併せて登録する
		await db.getRepository(MiUserProfile).insert({
			userId: 'quotesremoteuser01',
		});
		await db.getRepository(MiNote).update({ id: remoteQuoteId }, {
			userId: 'quotesremoteuser01',
			userHost: REMOTE_HOST,
		});
		await db.destroy();

		// リモート著者の引用を匿名応答の対象に含めるため、訪問者公開範囲は 'all' にする
		// (既定 'local' ではリモートコンテンツが匿名に返らない既存の床の仕様どおり)
		await api('admin/update-meta', { allowAnonymousQuotes: true, ugcVisibilityForVisitor: 'all' }, admin);
	}, 1000 * 60 * 2);

	afterAll(async () => {
		// 共有DBを汚さないよう既定(false)へ戻す
		await api('admin/update-meta', { allowAnonymousQuotes: false, blockedHosts: [], ugcVisibilityForVisitor: 'all' }, admin);
	});

	test('フラグ on の間は匿名も引用一覧を取得できる(ベースライン)', async () => {
		const ids = await fetchAnonymousQuoteIds();
		assert.ok(ids.includes(visibleQuote.id), JSON.stringify(ids));
		assert.ok(ids.includes(remoteQuoteId), JSON.stringify(ids));
	});

	test('停止ユーザーの引用は匿名に返さない', async () => {
		await api('admin/suspend-user', { userId: quoter.id }, admin);
		try {
			const ids = await fetchAnonymousQuoteIds();
			assert.ok(!ids.includes(visibleQuote.id), JSON.stringify(ids));
			// 無関係の引用は残る
			assert.ok(ids.includes(remoteQuoteId), JSON.stringify(ids));
		} finally {
			await api('admin/unsuspend-user', { userId: quoter.id }, admin);
		}
	});

	test('ブロックホストのユーザーの引用は匿名に返さない', async () => {
		await api('admin/update-meta', { blockedHosts: [REMOTE_HOST] }, admin);
		try {
			const ids = await fetchAnonymousQuoteIds();
			assert.ok(!ids.includes(remoteQuoteId), JSON.stringify(ids));
			assert.ok(ids.includes(visibleQuote.id), JSON.stringify(ids));
		} finally {
			await api('admin/update-meta', { blockedHosts: [] }, admin);
		}
	});

	test('フラグ off の間は匿名には空を返す(従来どおり)', async () => {
		await api('admin/update-meta', { allowAnonymousQuotes: false }, admin);
		try {
			const res = await api('notes/quotes', { noteId: target.id });
			assert.strictEqual(res.status, 200);
			assert.deepStrictEqual(res.body, []);
		} finally {
			await api('admin/update-meta', { allowAnonymousQuotes: true }, admin);
		}
	});
});
