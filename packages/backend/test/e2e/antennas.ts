/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { describe, beforeAll, beforeEach, test } from 'vitest';
import {
	api,
	failedApiCall,
	post,
	role,
	signup,
	successfulApiCall,
	testPaginationConsistency,
	uploadFile,
	userList,
	initTestDb,
} from '../utils.js';
import type * as misskey from 'misskey-js';
import type { DataSource } from 'typeorm';
import { Redis } from 'ioredis';
import { loadConfig } from '@/config.js';
import { DEFAULT_POLICIES } from '@/core/RoleService.js';

const compareBy = <T extends { id: string }>(selector: (s: T) => string = (s: T): string => s.id) => (a: T, b: T): number => {
	return selector(a).localeCompare(selector(b));
};

// アンテナの fanout にノートが載るまで待つ。
// post() は fanout への書き込みを待たないので、固定時間の待機だけだと前提が崩れる
async function waitForFanout(antennaId: string, noteId: string): Promise<void> {
	const redis = new Redis(loadConfig().redisForTimelines);
	try {
		const listKey = `list:antennaTimeline:${antennaId}`;
		for (let i = 0; i < 100; i++) {
			if ((await redis.lrange(listKey, 0, -1)).includes(noteId)) return;
			await new Promise(r => setTimeout(r, 50));
		}
		assert.fail(`前提が壊れている: ノート ${noteId} が fanout に載らなかった`);
	} finally {
		redis.disconnect();
	}
}

describe('アンテナ', () => {
	let db: DataSource;

	// エンティティとしてのアンテナを主眼においたテストを記述する
	// (Antennaを返すエンドポイント、Antennaエンティティを書き換えるエンドポイント、Antennaからノートを取得するエンドポイントをテストする)

	type Antenna = misskey.entities.Antenna;
	type User = misskey.entities.SignupResponse;
	type Note = misskey.entities.Note;

	// アンテナを作成できる最小のパラメタ
	const defaultParam = {
		caseSensitive: false,
		excludeKeywords: [['']],
		keywords: [['keyword']],
		name: 'test',
		src: 'all' as const,
		userListId: null,
		users: [''],
		withFile: false,
		withReplies: false,
		excludeBots: false,
	};

	let root: User;
	let alice: User;
	let bob: User;
	let carol: User;

	let alicePost: Note;
	let aliceList: misskey.entities.UserList;
	let bobFile: misskey.entities.DriveFile;
	let bobList: misskey.entities.UserList;

	let userNotExplorable: User;
	let userLocking: User;
	let userSilenced: User;
	let userSuspended: User;
	let userDeletedBySelf: User;
	let userDeletedByAdmin: User;
	let userFollowingAlice: User;
	let userFollowedByAlice: User;
	let userBlockingAlice: User;
	let userBlockedByAlice: User;
	let userMutingAlice: User;
	let userMutedByAlice: User;

	let testChannel: misskey.entities.Channel;
	let testMutedChannel: misskey.entities.Channel;

	beforeAll(async () => {
		// 上限超過の既存データを作るためにDBへ直接書き込む。
		// jobQueue() はワーカーまで起動してしまい、このファイルが意図的に残している
		// アカウント削除ジョブが走ってしまうため、接続だけ借りる initTestDb(true) を使う
		db = await initTestDb(true);
		root = await signup({ username: 'root' });
		alice = await signup({ username: 'alice' });
		alicePost = await post(alice, { text: 'test' });
		aliceList = await userList(alice, {});
		bob = await signup({ username: 'bob' });
		aliceList = await userList(alice, {});
		bobFile = (await uploadFile(bob)).body!;
		bobList = await userList(bob);
		carol = await signup({ username: 'carol' });
		await api('users/lists/push', { listId: aliceList.id, userId: bob.id }, alice);
		await api('users/lists/push', { listId: aliceList.id, userId: carol.id }, alice);

		userNotExplorable = await signup({ username: 'userNotExplorable' });
		await post(userNotExplorable, { text: 'test' });
		await api('i/update', { isExplorable: false }, userNotExplorable);
		userLocking = await signup({ username: 'userLocking' });
		await post(userLocking, { text: 'test' });
		await api('i/update', { isLocked: true }, userLocking);
		userSilenced = await signup({ username: 'userSilenced' });
		await post(userSilenced, { text: 'test' });
		const roleSilenced = await role(root, {}, { canPublicNote: { priority: 0, useDefault: false, value: false } });
		await api('admin/roles/assign', { userId: userSilenced.id, roleId: roleSilenced.id }, root);
		userSuspended = await signup({ username: 'userSuspended' });
		await post(userSuspended, { text: 'test' });
		await successfulApiCall({ endpoint: 'i/update', parameters: { description: '#user_testuserSuspended' }, user: userSuspended });
		await api('admin/suspend-user', { userId: userSuspended.id }, root);
		userDeletedBySelf = await signup({ username: 'userDeletedBySelf', password: 'userDeletedBySelf' });
		await post(userDeletedBySelf, { text: 'test' });
		await api('i/delete-account', { password: 'userDeletedBySelf' }, userDeletedBySelf);
		userDeletedByAdmin = await signup({ username: 'userDeletedByAdmin' });
		await post(userDeletedByAdmin, { text: 'test' });
		await api('admin/delete-account', { userId: userDeletedByAdmin.id }, root);
		userFollowedByAlice = await signup({ username: 'userFollowedByAlice' });
		await post(userFollowedByAlice, { text: 'test' });
		await api('following/create', { userId: userFollowedByAlice.id }, alice);
		userFollowingAlice = await signup({ username: 'userFollowingAlice' });
		await post(userFollowingAlice, { text: 'test' });
		await api('following/create', { userId: alice.id }, userFollowingAlice);
		userBlockingAlice = await signup({ username: 'userBlockingAlice' });
		await post(userBlockingAlice, { text: 'test' });
		await api('blocking/create', { userId: alice.id }, userBlockingAlice);
		userBlockedByAlice = await signup({ username: 'userBlockedByAlice' });
		await post(userBlockedByAlice, { text: 'test' });
		await api('blocking/create', { userId: userBlockedByAlice.id }, alice);
		userMutingAlice = await signup({ username: 'userMutingAlice' });
		await post(userMutingAlice, { text: 'test' });
		await api('mute/create', { userId: alice.id }, userMutingAlice);
		userMutedByAlice = await signup({ username: 'userMutedByAlice' });
		await post(userMutedByAlice, { text: 'test' });
		await api('mute/create', { userId: userMutedByAlice.id }, alice);

		testChannel = (await api('channels/create', { name: 'test' }, root)).body;
		testMutedChannel = (await api('channels/create', { name: 'test-muted' }, root)).body;
		await api('channels/mute/create', { channelId: testMutedChannel.id }, alice);
	}, 1000 * 60 * 10);

	beforeEach(async () => {
		// テスト間で影響し合わないように毎回全部消す。
		for (const user of [alice, bob]) {
			const list = await api('antennas/list', {}, user);
			// 失敗時は body がエラーオブジェクトになるので、配列でなければ何もしない
			// (ここで落とすとこのファイルの全テストが連鎖的に失敗する)
			if (!Array.isArray(list.body)) continue;
			for (const antenna of list.body) {
				await api('antennas/delete', { antennaId: antenna.id }, user);
			}
		}
	});

	//#region 作成(antennas/create)

	test('が作成できること、キーが過不足なく入っていること。', async () => {
		const response = await successfulApiCall({
			endpoint: 'antennas/create',
			parameters: defaultParam,
			user: alice,
		});
		assert.match(response.id, /[0-9a-z]{10}/);
		const expected: Antenna = {
			id: response.id,
			caseSensitive: false,
			createdAt: new Date(response.createdAt).toISOString(),
			excludeKeywords: [['']],
			mustExcludeKeywords: [],
			expression: null,
			excludeNotesInSensitiveChannel: false,
			hasUnreadNote: false,
			isActive: true,
			lastUsedAt: new Date(response.lastUsedAt).toISOString(),
			keywords: [['keyword']],
			name: 'test',
			src: 'all',
			userListId: null,
			users: [''],
			withFile: false,
			withReplies: false,
			excludeBots: false,
			localOnly: false,
			notify: false,
			onlyFollowers: false,
			keywordMode: 'literal',
		};
		assert.deepStrictEqual(response, expected);
	});

	test('が上限いっぱいまで作成できること', async () => {
		const response = await Promise.all([...Array(DEFAULT_POLICIES.antennaLimit)].map(() => successfulApiCall({
			endpoint: 'antennas/create',
			parameters: { ...defaultParam },
			user: alice,
		})));

		const expected = await successfulApiCall({ endpoint: 'antennas/list', parameters: {}, user: alice });
		assert.deepStrictEqual(
			response.sort(compareBy(s => s.id)),
			expected.sort(compareBy(s => s.id)));

		failedApiCall({
			endpoint: 'antennas/create',
			parameters: { ...defaultParam },
			user: alice,
		}, {
			status: 400,
			code: 'TOO_MANY_ANTENNAS',
			id: 'faf47050-e8b5-438c-913c-db2b1576fde4',
		});
	});

	test('を作成するとき他人のリストを指定したらエラーになる', async () => {
		failedApiCall({
			endpoint: 'antennas/create',
			parameters: { ...defaultParam, src: 'list', userListId: bobList.id },
			user: alice,
		}, {
			status: 400,
			code: 'NO_SUCH_USER_LIST',
			id: '95063e93-a283-4b8b-9aa5-bcdb8df69a7f',
		});
	});

	const antennaParamPattern = [
		{ parameters: () => ({ name: 'x'.repeat(100) }) },
		{ parameters: () => ({ name: 'x' }) },
		{ parameters: () => ({ src: 'home' as const }) },
		{ parameters: () => ({ src: 'all' as const }) },
		{ parameters: () => ({ src: 'users' as const }) },
		{ parameters: () => ({ src: 'list' as const }) },
		{ parameters: () => ({ userListId: null }) },
		{ parameters: () => ({ src: 'list' as const, userListId: aliceList.id }) },
		{ parameters: () => ({ keywords: [['x']] }) },
		{ parameters: () => ({ keywords: [['a', 'b', 'c'], ['x'], ['y'], ['z']] }) },
		{ parameters: () => ({ excludeKeywords: [['a', 'b', 'c'], ['x'], ['y'], ['z']] }) },
		{ parameters: () => ({ users: [alice.username] }) },
		{ parameters: () => ({ users: [alice.username, bob.username, carol.username] }) },
		{ parameters: () => ({ caseSensitive: false }) },
		{ parameters: () => ({ caseSensitive: true }) },
		{ parameters: () => ({ withReplies: false }) },
		{ parameters: () => ({ withReplies: true }) },
		{ parameters: () => ({ withFile: false }) },
		{ parameters: () => ({ withFile: true }) },
		{ parameters: () => ({ excludeNotesInSensitiveChannel: false }) },
		{ parameters: () => ({ excludeNotesInSensitiveChannel: true }) },
		{ parameters: () => ({ onlyFollowers: false }) },
		{ parameters: () => ({ onlyFollowers: true }) },
	];
	test.each(antennaParamPattern)('を作成できること($#)', async ({ parameters }) => {
		const response = await successfulApiCall({
			endpoint: 'antennas/create',
			parameters: { ...defaultParam, ...parameters() },
			user: alice,
		});
		const expected = { ...response, ...parameters() };
		assert.deepStrictEqual(response, expected);
	});

	test('を作成する時キーワードが指定されていないとエラーになる', async () => {
		await failedApiCall({
			endpoint: 'antennas/create',
			parameters: { ...defaultParam, keywords: [[]], excludeKeywords: [[]] },
			user: alice,
		}, {
			status: 400,
			code: 'EMPTY_KEYWORD',
			id: '53ee222e-1ddd-4f9a-92e5-9fb82ddb463a',
		});
	});

	test('を作成する時srcがlistなのにuserListIdが無ければエラーになる', async () => {
		await failedApiCall({
			endpoint: 'antennas/create',
			parameters: { ...defaultParam, src: 'list', userListId: null },
			user: alice,
		}, {
			status: 400,
			code: 'NO_SUCH_USER_LIST',
			id: '95063e93-a283-4b8b-9aa5-bcdb8df69a7f',
		});
	});
	//#endregion
	//#region 更新(antennas/update)

	test.each(antennaParamPattern)('を変更できること($#)', async ({ parameters }) => {
		const antenna = await successfulApiCall({ endpoint: 'antennas/create', parameters: defaultParam, user: alice });
		const response = await successfulApiCall({
			endpoint: 'antennas/update',
			parameters: { antennaId: antenna.id, ...defaultParam, ...parameters() },
			user: alice,
		});
		const expected = { ...response, ...parameters() };
		assert.deepStrictEqual(response, expected);
	});
	test.todo('は他人のものは変更できない');

	test('を変更するとき他人のリストを指定したらエラーになる', async () => {
		const antenna = await successfulApiCall({ endpoint: 'antennas/create', parameters: defaultParam, user: alice });
		failedApiCall({
			endpoint: 'antennas/update',
			parameters: { antennaId: antenna.id, ...defaultParam, src: 'list', userListId: bobList.id },
			user: alice,
		}, {
			status: 400,
			code: 'NO_SUCH_USER_LIST',
			id: '1c6b35c9-943e-48c2-81e4-2844989407f7',
		});
	});
	test('を変更する時キーワードが指定されていないとエラーになる', async () => {
		const antenna = await successfulApiCall({ endpoint: 'antennas/create', parameters: defaultParam, user: alice });
		await failedApiCall({
			endpoint: 'antennas/update',
			parameters: { ...defaultParam, antennaId: antenna.id, keywords: [[]], excludeKeywords: [[]] },
			user: alice,
		}, {
			status: 400,
			code: 'EMPTY_KEYWORD',
			id: '721aaff6-4e1b-4d88-8de6-877fae9f68c4',
		});
	});

	test('を変更する時srcをlistにするのにuserListIdが無ければエラーになる', async () => {
		const antenna = await successfulApiCall({ endpoint: 'antennas/create', parameters: defaultParam, user: alice });
		await failedApiCall({
			endpoint: 'antennas/update',
			parameters: { antennaId: antenna.id, src: 'list', userListId: null },
			user: alice,
		}, {
			status: 400,
			code: 'NO_SUCH_USER_LIST',
			id: '1c6b35c9-943e-48c2-81e4-2844989407f7',
		});
	});

	//#endregion
	//#region 表示(antennas/show)

	test('をID指定で表示できること。', async () => {
		const antenna = await successfulApiCall({ endpoint: 'antennas/create', parameters: defaultParam, user: alice });
		const response = await successfulApiCall({
			endpoint: 'antennas/show',
			parameters: { antennaId: antenna.id },
			user: alice,
		});
		const expected = { ...antenna };
		assert.deepStrictEqual(response, expected);
	});
	test.todo('は他人のものをID指定で表示できない');

	//#endregion
	//#region 一覧(antennas/list)

	test('をリスト形式で取得できること。', async () => {
		const antenna = await successfulApiCall({ endpoint: 'antennas/create', parameters: defaultParam, user: alice });
		await successfulApiCall({ endpoint: 'antennas/create', parameters: defaultParam, user: bob });
		const response = await successfulApiCall({
			endpoint: 'antennas/list',
			parameters: {},
			user: alice,
		});
		const expected = [{ ...antenna }];
		assert.deepStrictEqual(response, expected);
	});

	//#endregion
	//#region 削除(antennas/delete)

	test('を削除できること。', async () => {
		const antenna = await successfulApiCall({ endpoint: 'antennas/create', parameters: defaultParam, user: alice });
		const response = await successfulApiCall({
			endpoint: 'antennas/delete',
			parameters: { antennaId: antenna.id },
			user: alice,
		});
		assert.deepStrictEqual(response, null);
		const list = await successfulApiCall({ endpoint: 'antennas/list', parameters: {}, user: alice });
		assert.deepStrictEqual(list, []);
	});
	test.todo('は他人のものを削除できない');

	//#endregion

	describe('のTLへの補完(既存ノート)', () => {
		// アンテナの TL は受信時の fanout だけを並べるため、作成直後は空になりやすい。
		// 一方で試し打ち(antennas/test)は既存ノートを走査するので、
		// 「試し打ちでは当たるのに保存しても TL に出ない」という食い違いが起きていた。
		// 作成時点以降のノートは TL の先頭読み込み時に補完して、この食い違いを無くしている。
		test('fanoutから取りこぼした作成後のノートも、現在の条件に合えばTLに出ること。', async () => {
			// fanout は受信時に積まれるだけなので、取りこぼすと TL から永久に欠ける。
			// 作成時点以降のノートは TL の先頭読み込み時に現在の条件で補完する。
			// ここでは fanout から直接消して「取りこぼし」を作る (Redis はテスト用のもの)
			const keyword = '取りこぼしキーワード';
			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywords: [[keyword]] },
				user: alice,
			});
			const note = await post(bob, { text: `${keyword} 1` });

			// fanout のリストからだけ消す。ノート自体は残っている。
			// (remove-note は「明示的な削除」も記録してしまうため、ここでは Redis を直接操作する)
			// アプリ本体が使う接続設定をそのまま使う。
			// keyPrefix はここで付与されるので、付け忘れると別キーを操作してしまい
			// 「取りこぼし」を再現できず、テストが常に通ってしまう
			const redis = new Redis(loadConfig().redisForTimelines);
			try {
				const listKey = `list:antennaTimeline:${antenna.id}`;
				// post() はアンテナへの fanout 書き込みを待たないので、載るまで待ってから消す。
				// 待たずに消すと 0 件削除になり「取りこぼし」を作れないままテストが通ってしまう
				let appeared = false;
				for (let i = 0; i < 100; i++) {
					const ids = await redis.lrange(listKey, 0, -1);
					if (ids.includes(note.id)) {
						appeared = true;
						break;
					}
					await new Promise(r => setTimeout(r, 50));
				}
				assert.ok(appeared, 'テストの前提が壊れている: ノートが fanout に載らなかった');

				// 実際に 1 件消せたことを確認する (0 件だと取りこぼしを再現できていない)
				const removedCount = await redis.lrem(listKey, 1, note.id);
				assert.strictEqual(removedCount, 1, 'テストの前提が壊れている: fanout から削除できなかった');

				const remaining = await redis.lrange(listKey, 0, -1);
				assert.ok(!remaining.includes(note.id), 'テストの前提が壊れている: fanout に残っている');
			} finally {
				redis.disconnect();
			}

			const response = await successfulApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: antenna.id },
				user: alice,
			});
			assert.ok(response.some((x: Note) => x.id === note.id));
		});

		test('試し打ち(antennas/test)で当たったノートが、保存後のTLにも出ること。', async () => {
			const keyword = '試し打ち一致';
			await post(bob, { text: `${keyword} preview` });

			const preview = await successfulApiCall({
				endpoint: 'antennas/test',
				parameters: { ...defaultParam, keywords: [[keyword]] },
				user: alice,
			});
			assert.ok(preview.length > 0);

			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywords: [[keyword]] },
				user: alice,
			});
			// 試し打ちが「当たる」と表示したノートは、保存後の TL にも出る。
			// (作成前のノートも現在の条件に合えば補完される)
			const response = await successfulApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: antenna.id },
				user: alice,
			});
			// 並び順は経路で変わりうるので集合で比較する (何が「当たるか」が一致していることが本題)
			assert.deepStrictEqual(
				response.map((x: Note) => x.id).sort(),
				preview.map((x: Note) => x.id).sort(),
			);

			// 作成後に投稿したノートも TL に加わる
			const afterNote = await post(bob, { text: `${keyword} after` });
			const after = await successfulApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: antenna.id },
				user: alice,
			});
			assert.ok(after.some((x: Note) => x.id === afterNote.id));
			// 既に出ていたノートは残っている
			assert.ok(after.length > preview.length);
		});

		test('明示的に外したノートがTLの再読み込みで戻らないこと。', async () => {
			const keyword = '補完と削除';
			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywords: [[keyword]] },
				user: alice,
			});
			const note = await post(bob, { text: `${keyword} 1` });

			// まずは TL に出る
			const before = await successfulApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: antenna.id },
				user: alice,
			});
			assert.ok(before.some((x: Note) => x.id === note.id));

			await successfulApiCall({
				endpoint: 'antennas/remove-note',
				parameters: { antennaId: antenna.id, noteId: note.id },
				user: alice,
			});

			// 補完で拾い直されない (リストから消すだけだと再読み込みで戻ってしまう)
			const after = await successfulApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: antenna.id },
				user: alice,
			});
			assert.deepStrictEqual(after, []);
		});

		test('補完したノートが受信済みより新しくても、件数制限で捨てられないこと。', async () => {
			// fanout の履歴を先に連結して件数制限すると、補完で拾ったより新しいノートが落ちる。
			// limit=1 で「最も新しい一致ノート」が返ることを確認する
			const keyword = '補完順序';
			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywords: [[keyword]] },
				user: alice,
			});
			const older = await post(bob, { text: `${keyword} A` });
			const newer = await post(bob, { text: `${keyword} B` });

			// 比較対象の古いノートも受信済みであることを確認する。
			// これが無いと、結果が補完だけで期待値に一致していてもテストが通ってしまう
			await waitForFanout(antenna.id, older.id);
			await waitForFanout(antenna.id, newer.id);

			// B (新しい方) を fanout からだけ落として、補完でしか拾えない状態にする
			const redis = new Redis(loadConfig().redisForTimelines);
			try {
				const listKey = `list:antennaTimeline:${antenna.id}`;
				for (let i = 0; i < 100; i++) {
					if ((await redis.lrange(listKey, 0, -1)).includes(newer.id)) break;
					await new Promise(r => setTimeout(r, 50));
				}
				assert.strictEqual(await redis.lrem(listKey, 1, newer.id), 1);
			} finally {
				redis.disconnect();
			}

			const response = await successfulApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: antenna.id, limit: 1 },
				user: alice,
			});
			assert.deepStrictEqual(response.map((x: Note) => x.id), [newer.id]);
		});

		test('条件で絞り込んだ後も、一致するノートがあればページが空にならないこと。', async () => {
			// 古い条件でだけ一致するノートが件数枠を食い、条件的には一致するノートが
			// 次のページに押し出されると、一致ノートがあるのに空のページが返る
			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywords: [['変更前']] },
				user: alice,
			});
			const oldNote = await post(bob, { text: '変更前 のノート' });
			// 旧条件のノートも受信済みにする
			await waitForFanout(antenna.id, oldNote.id);

			await successfulApiCall({
				endpoint: 'antennas/update',
				parameters: { ...defaultParam, antennaId: antenna.id, keywords: [['変更後']] },
				user: alice,
			});
			// 条件変更は Redis 経由で非同期に反映されるため、
			// 投稿時点で新しい条件が配信側に届いているかを、ノートが fanout に載るかで確認する
			const matching = await post(bob, { text: '変更後 のノート' });
			await waitForFanout(antenna.id, matching.id);

			// 新しい方を fanout から落として、補完でしか拾えない状態にする
			const redis = new Redis(loadConfig().redisForTimelines);
			try {
				const listKey = `list:antennaTimeline:${antenna.id}`;
				for (let i = 0; i < 100; i++) {
					if ((await redis.lrange(listKey, 0, -1)).includes(matching.id)) break;
					await new Promise(r => setTimeout(r, 50));
				}
				assert.strictEqual(await redis.lrem(listKey, 1, matching.id), 1);
			} finally {
				redis.disconnect();
			}

			const response = await successfulApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: antenna.id, limit: 1 },
				user: alice,
			});
			assert.deepStrictEqual(response.map((x: Note) => x.id), [matching.id]);
		});

		test('条件を変更すると、現在の条件に合わないノートがTLから消えること。', async () => {
			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywords: [['変更前キーワード']] },
				user: alice,
			});
			await post(bob, { text: '変更前キーワード 1' });

			const before = await successfulApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: antenna.id },
				user: alice,
			});
			assert.strictEqual(before.length, 1);

			await successfulApiCall({
				endpoint: 'antennas/update',
				parameters: { ...defaultParam, antennaId: antenna.id, keywords: [['変更後キーワード']] },
				user: alice,
			});
			const newNote = await post(bob, { text: '変更後キーワード 2' });

			// 受信済みでも現在の条件に合わないものは並べない(マッチ理由も付かなくなるため)
			const after = await successfulApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: antenna.id },
				user: alice,
			});
			assert.deepStrictEqual(after.map((x: Note) => x.id), [newNote.id]);
		});
	});

	describe('のTL内検索', () => {
		test('queryでアンテナのTL内を検索できること。', async () => {
			const keyword = '検索キーワード';
			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywords: [[keyword]] },
				user: alice,
			});
			const hit = await post(bob, { text: `${keyword} りんご` });
			await post(bob, { text: `${keyword} みかん` });

			const response = await successfulApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: antenna.id, query: 'りんご' },
				user: alice,
			});
			assert.deepStrictEqual(response.map((x: Note) => x.id), [hit.id]);
		});

		test('queryとuntilIdで検索結果をページングできること。', async () => {
			const keyword = 'ページングキーワード';
			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywords: [[keyword]] },
				user: alice,
			});
			const hits: Note[] = [];
			for (let i = 0; i < 12; i++) {
				hits.push(await post(bob, { text: `${keyword} さがす ${i}` }));
				// 条件には当たるがクエリには一致しないノートを混ぜる
				await post(bob, { text: `${keyword} ちがう ${i}` });
			}

			// 期待値: 検索語に一致するノートを新しい順(= id 降順)に並べたもの。
			// 件数だけでなく中身を比較しないと、検索語が無視されていても通ってしまう
			const expected = hits.map(x => x.id).sort((a, b) => a > b ? -1 : 1);

			const first = await successfulApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: antenna.id, query: 'さがす', limit: 5 },
				user: alice,
			});
			assert.deepStrictEqual(first.map((x: Note) => x.id), expected.slice(0, 5));

			const second = await successfulApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: antenna.id, query: 'さがす', limit: 5, untilId: first[first.length - 1].id },
				user: alice,
			});
			assert.deepStrictEqual(second.map((x: Note) => x.id), expected.slice(5, 10));
		});

		test('検索語に一致するノートが走査窓より古くても検索できること。', async () => {
			// 補完は条件一致で打ち切る件数を数えるため、検索語に一致するノートが
			// 1 バッチ(200件)より奥にあると、条件だけ合うノートで打ち切られて空になる
			const keyword = '深い検索キーワード';
			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywords: [[keyword]] },
				user: alice,
			});
			// 最も古い位置に検索語一致のノート。
			// 後続のノートで fanout の保持件数から押し出されるので、補完でしか拾えない状態になる
			const target = await post(bob, { text: `${keyword} needleword` });
			// それより新しい、条件には合うが検索語に合わないノートを 250 件
			for (let i = 0; i < 450; i++) {
				await post(bob, { text: `${keyword} filler ${i}` });
			}
			// いちばん新しいノートは受信済みになっているはず (fanout が動いていることの確認)
			const newest = await post(bob, { text: `${keyword} filler newest` });
			await waitForFanout(antenna.id, newest.id);

			const response = await successfulApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: antenna.id, query: 'needleword', limit: 5 },
				user: alice,
			});
			assert.deepStrictEqual(response.map((x: Note) => x.id), [target.id]);
		});

		test('sinceIdで新しいノートを古い順に取得できること。', async () => {
			const keyword = '昇順キーワード';
			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywords: [[keyword]] },
				user: alice,
			});
			const older = await post(bob, { text: `${keyword} ふるい` });
			await new Promise(r => setTimeout(r, 5));
			const newer: Note[] = [];
			for (let i = 0; i < 3; i++) {
				newer.push(await post(bob, { text: `${keyword} あたらしい ${i}` }));
			}

			const response = await successfulApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: antenna.id, sinceId: older.id },
				user: alice,
			});
			// sinceId 指定時は古い順に返る
			assert.deepStrictEqual(response.map((x: Note) => x.id), newer.map(x => x.id));
		});

		test('queryが他人のアンテナでは使えないこと。', async () => {
			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywords: [['他人確認キーワード']] },
				user: alice,
			});
			await failedApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: antenna.id, query: 'test' },
				user: bob,
			}, {
				status: 400,
				code: 'NO_SUCH_ANTENNA',
				id: '850926e0-fd3b-49b6-b69a-b28a5dbd82fe',
			});
		});
	});

	describe('のマッチ理由(antennas/match-info)', () => {
		test('マッチしたキーワードグループを返すこと。', async () => {
			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywords: [['りんご', 'みかん']] },
				user: alice,
			});
			const note = await post(bob, { text: 'りんごとみかん' });

			const response = await successfulApiCall({
				endpoint: 'antennas/match-info',
				parameters: { antennaId: antenna.id, noteIds: [note.id] },
				user: alice,
			});
			assert.deepStrictEqual(response, [{
				noteId: note.id,
				matchedKeywords: [['りんご', 'みかん']],
				matchedExcludeKeywords: [],
			}]);
		});

		test('他人のアンテナでは取得できないこと。', async () => {
			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywords: [['りんご']] },
				user: alice,
			});
			const note = await post(bob, { text: 'りんご' });
			await failedApiCall({
				endpoint: 'antennas/match-info',
				parameters: { antennaId: antenna.id, noteIds: [note.id] },
				user: bob,
			}, {
				status: 400,
				code: 'NO_SUCH_ANTENNA',
				id: '5d7f2c8e-3f6a-4b1e-9a2c-7e4d8f1a3b5c',
			});
		});
	});

	describe('の試し打ち(antennas/test)', () => {
		test('保存前の条件にマッチする直近のノートを返すこと。', async () => {
			await post(bob, { text: 'りんごのノート' });
			const response = await successfulApiCall({
				endpoint: 'antennas/test',
				parameters: { ...defaultParam, keywords: [['りんご']] },
				user: alice,
			});
			assert.ok(response.some((x: Note) => x.text === 'りんごのノート'));
		});

		test('キーワードと除外キーワードが両方空ならエラーになること。', async () => {
			await failedApiCall({
				endpoint: 'antennas/test',
				parameters: { ...defaultParam, keywords: [[]], excludeKeywords: [[]] },
				user: alice,
			}, {
				status: 400,
				code: 'EMPTY_KEYWORD',
				id: 'b3f9a1c2-4d5e-4f6a-8b7c-9d0e1f2a3b4c',
			});
		});
	});

	describe('の正規表現モード(keywordMode)', () => {
		test('regexモードで作成できること。', async () => {
			const response = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywordMode: 'regex', keywords: [['りんご|みかん']] },
				user: alice,
			});
			assert.deepStrictEqual(response.keywordMode, 'regex');
			assert.deepStrictEqual(response.keywords, [['りんご|みかん']]);
		});

		test('keywordMode未指定ならliteralになること。', async () => {
			const response = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: defaultParam,
				user: alice,
			});
			assert.deepStrictEqual(response.keywordMode, 'literal');
		});

		test('regexモードで不正な正規表現だと作成がエラーになること。', async () => {
			await failedApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywordMode: 'regex', keywords: [['(unclosed']] },
				user: alice,
			}, {
				status: 400,
				code: 'INVALID_REGEX',
				id: '03534a02-f779-456a-bcf2-d4e490401bfa',
			});
		});

		test('literalモードでは正規表現として不正な文字列も作成できること。', async () => {
			const response = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywordMode: 'literal', keywords: [['(unclosed']] },
				user: alice,
			});
			assert.deepStrictEqual(response.keywordMode, 'literal');
		});

		test('regexモードへの変更と不正な正規表現への変更がエラーになること。', async () => {
			const antenna = await successfulApiCall({ endpoint: 'antennas/create', parameters: defaultParam, user: alice });
			const updated = await successfulApiCall({
				endpoint: 'antennas/update',
				parameters: { ...defaultParam, antennaId: antenna.id, keywordMode: 'regex', keywords: [['^りんご$']] },
				user: alice,
			});
			assert.deepStrictEqual(updated.keywordMode, 'regex');

			await failedApiCall({
				endpoint: 'antennas/update',
				parameters: { ...defaultParam, antennaId: antenna.id, keywordMode: 'regex', keywords: [['*bad']] },
				user: alice,
			}, {
				status: 400,
				code: 'INVALID_REGEX',
				id: '68573d35-69af-48dc-bd62-e2a059907cf5',
			});

			// 既存がregexモードのまま不正なパターンへキーワードだけ変える場合もエラーになる
			await failedApiCall({
				endpoint: 'antennas/update',
				parameters: { ...defaultParam, antennaId: antenna.id, keywordMode: 'regex', keywords: [['[bad']] },
				user: alice,
			}, {
				status: 400,
				code: 'INVALID_REGEX',
				id: '68573d35-69af-48dc-bd62-e2a059907cf5',
			});
		});

		test('モード切替とキーワード更新を同時に投げても、最終状態が矛盾しないこと。', async () => {
			// 片方はregexへの切替 (キーワードは保存済みのものを検証)、もう片方は不正な式への更新。
			// 行ロックで直列化されるため、到達順に関係なく最終状態は次のどちらかになる:
			//   - 切替が先: 不正な式の更新が regex として検証され 400、最終状態は regex + 保存済みの有効な式
			//   - 更新が先: literal のまま不正な文字列が入り 200、切替は保存済みの不正な式を検証して 400
			// どちらの順序でも、最終状態が「regex + 不正な式」になることはない。
			// (HTTPを並行に投げても到達順は保証されないので、ここでは最終状態の不変条件だけを検証する)
			const antenna = await successfulApiCall({ endpoint: 'antennas/create', parameters: defaultParam, user: alice });

			const [switchMode, updateKeywords] = await Promise.all([
				api('antennas/update', { antennaId: antenna.id, keywordMode: 'regex' }, alice),
				api('antennas/update', { ...defaultParam, antennaId: antenna.id, keywords: [['(unclosed']] }, alice),
			]);

			const final = await successfulApiCall({
				endpoint: 'antennas/show',
				parameters: { antennaId: antenna.id },
				user: alice,
			});

			// どちらか一方は必ず失敗している (両方成功すると regex + 不正な式が保存されうる)
			assert.notStrictEqual(switchMode.status, updateKeywords.status);
			if (final.keywordMode === 'regex') {
				assert.strictEqual(switchMode.status, 200);
				assert.strictEqual(updateKeywords.status, 400);
				assert.ok(!final.keywords.flat().includes('(unclosed'));
			} else {
				assert.strictEqual(updateKeywords.status, 200);
				assert.strictEqual(switchMode.status, 400);
				assert.deepStrictEqual(final.keywords, [['(unclosed']]);
			}
		});

		test('キーワード配列の上限はモードに関係なく新規作成に適用されること。', async () => {
			// 受信経路はモードに関係なく全キーワードを走査するので、literalでも上限を超えられない
			const tooManyGroups = Array.from({ length: 33 }, () => ['a']);
			await failedApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywordMode: 'literal', keywords: tooManyGroups },
				user: alice,
			}, {
				status: 400,
				code: 'KEYWORD_LIMIT_EXCEEDED',
				id: '4b8e2f61-7d3a-49c5-a0e8-1f6c9b2d7e43',
			});
		});

		test('上限を超えた既存アンテナは、超過が増えない限り保存できること。', async () => {
			// 従来のAPIでは上限を超えるアンテナを保存できていた。paramDef で弾くと
			// 編集画面がキーワード配列を再送するため、名前だけの変更も通らなくなる
			const antenna = await successfulApiCall({ endpoint: 'antennas/create', parameters: defaultParam, user: alice });
			// 上限超過の既存データを直接作る (API では作れない)
			await db.query('UPDATE "antenna" SET "keywords" = $1 WHERE "id" = $2', [
				JSON.stringify([Array.from({ length: 33 }, () => 'a')]),
				antenna.id,
			]);

			// 名前だけの変更 (編集画面は保存済みの超過分をそのまま再送する) は通る
			const overLimitKeywords = [Array.from({ length: 33 }, () => 'a')];
			const renamed = await successfulApiCall({
				endpoint: 'antennas/update',
				parameters: { ...defaultParam, antennaId: antenna.id, name: 'renamed-over-limit', keywords: overLimitKeywords },
				user: alice,
			});
			assert.strictEqual(renamed.name, 'renamed-over-limit');
			assert.strictEqual(renamed.keywords[0].length, 33);

			// 超過を増やす変更は拒否する
			await failedApiCall({
				endpoint: 'antennas/update',
				parameters: { ...defaultParam, antennaId: antenna.id, keywords: [Array.from({ length: 40 }, () => 'a')] },
				user: alice,
			}, {
				status: 400,
				code: 'KEYWORD_LIMIT_EXCEEDED',
				id: '9c1f0d27-5b6e-4a83-9f21-6d3b8e4c1a70',
			});

			// 超過を解消する変更も通る
			const fixed = await successfulApiCall({
				endpoint: 'antennas/update',
				parameters: { ...defaultParam, antennaId: antenna.id, keywords: [['a', 'b']] },
				user: alice,
			});
			assert.deepStrictEqual(fixed.keywords, [['a', 'b']]);
		});

		test('試し打ち(antennas/test)も保存と同じ上限を課すこと。', async () => {
			// 試し打ちだけ通って保存で失敗すると、結果を信じて保存したユーザーが混乱する
			await failedApiCall({
				endpoint: 'antennas/test',
				parameters: { ...defaultParam, keywordMode: 'literal', keywords: [Array.from({ length: 33 }, () => 'a')] },
				user: alice,
			}, {
				status: 400,
				code: 'KEYWORD_LIMIT_EXCEEDED',
				id: '2e7a5c94-8f13-4d6b-b0a2-7c4e1d9f3b58',
			});
		});

		test('上限超過のキーワードは create で KEYWORD_LIMIT_EXCEEDED を返すこと。', async () => {
			// paramDef で弾くと汎用の INVALID_PARAM になり、どの項目が超過しているか返せない
			await failedApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywordMode: 'literal', keywords: [Array.from({ length: 33 }, () => 'a')] },
				user: alice,
			}, {
				status: 400,
				code: 'KEYWORD_LIMIT_EXCEEDED',
				id: '4b8e2f61-7d3a-49c5-a0e8-1f6c9b2d7e43',
			});
		});

		test('SCOREモードでないときは強制除外キーワードを検証しないこと。', async () => {
			// mustExcludeKeywords は SCORE モードでしか使われないので、壊れた式が残っていても
			// regex への切替や保存をブロックしない
			const antenna = await successfulApiCall({ endpoint: 'antennas/create', parameters: defaultParam, user: alice });
			const res = await successfulApiCall({
				endpoint: 'antennas/update',
				parameters: { ...defaultParam, antennaId: antenna.id, keywordMode: 'regex', keywords: [['ok']], mustExcludeKeywords: [['(unclosed']] },
				user: alice,
			});
			assert.strictEqual(res.keywordMode, 'regex');

			// SCORE モードにすると同じ式が検証対象になる
			await failedApiCall({
				endpoint: 'antennas/update',
				parameters: { ...defaultParam, antennaId: antenna.id, keywordMode: 'regex', expression: 'SCORE', keywords: [['ok']], mustExcludeKeywords: [['(unclosed']] },
				user: alice,
			}, {
				status: 400,
				code: 'INVALID_REGEX',
				id: '68573d35-69af-48dc-bd62-e2a059907cf5',
			});
		});

		test('パターンは本文全体への部分一致で、CW があると ^$ は行単位にならないこと。', async () => {
			// アンカーの意味を固定しておく (ドキュメントの記述と一致させる)
			const withCw = await post(bob, { text: 'りんご', cw: 'ネタバレ' });
			const plain = await post(bob, { text: 'りんご' });

			const anchored = await successfulApiCall({
				endpoint: 'antennas/test',
				parameters: { ...defaultParam, keywordMode: 'regex', keywords: [['^りんご$']] },
				user: alice,
			});
			// CW 付きは本文が "りんご\nネタバレ" になるので一致しない
			assert.ok(!anchored.some((x: Note) => x.id === withCw.id));
			assert.ok(anchored.some((x: Note) => x.id === plain.id));

			// (?m) を使えば行単位で一致する
			const multiline = await successfulApiCall({
				endpoint: 'antennas/test',
				parameters: { ...defaultParam, keywordMode: 'regex', keywords: [['(?m)^りんご$']] },
				user: alice,
			});
			assert.ok(multiline.some((x: Note) => x.id === withCw.id));
		});

		test('INVALID_REGEX はどの項目が不正かを info で返すこと。', async () => {
			const res = await api('antennas/create', {
				...defaultParam,
				keywordMode: 'regex',
				keywords: [['ok']],
				excludeKeywords: [['fine', '(bad']],
			}, alice);
			assert.strictEqual(res.status, 400);
			const body = res.body as unknown as { error: { code: string; info: { reason: string; pattern: string; location: { keywordType: string; groupIndex: number; keywordIndex: number } } } };
			assert.strictEqual(body.error.code, 'INVALID_REGEX');
			assert.strictEqual(body.error.info.reason, 'invalidPattern');
			assert.strictEqual(body.error.info.pattern, '(bad');
			assert.deepStrictEqual(body.error.info.location, { keywordType: 'excludeKeywords', groupIndex: 0, keywordIndex: 1 });
		});

		test('試し打ち(antennas/test)でも128文字を超える有効な正規表現を受け付けること。', async () => {
			// 保存 (create) は512文字まで許可するので、プレビューでも同じ上限まで受け付ける
			const unique = 'longpattern-' + Math.random().toString(36).slice(2);
			await post(bob, { text: unique });
			const longPattern = 'a|'.repeat(100) + unique; // 201文字超
			const response = await successfulApiCall({
				endpoint: 'antennas/test',
				parameters: { ...defaultParam, keywordMode: 'regex', keywords: [[longPattern]] },
				user: alice,
			});
			assert.ok(response.some((x: Note) => x.text === unique));
		});

		test('試し打ち(antennas/test)がregexでマッチし、不正な正規表現はエラーになること。', async () => {
			await post(bob, { text: 'りんご100円' });
			const response = await successfulApiCall({
				endpoint: 'antennas/test',
				parameters: { ...defaultParam, keywordMode: 'regex', keywords: [['りんご[0-9]+円']] },
				user: alice,
			});
			assert.ok(response.some((x: Note) => x.text === 'りんご100円'));

			// regexモードでは | は分割されず1つのパターンとして扱われる
			const either = await successfulApiCall({
				endpoint: 'antennas/test',
				parameters: { ...defaultParam, keywordMode: 'regex', keywords: [['バナナ|りんご[0-9]+円']] },
				user: alice,
			});
			assert.ok(either.some((x: Note) => x.text === 'りんご100円'));

			// 対照: literalモードでは同じ文字列は「そのままの文字列」でしか一致しない
			const literal = await successfulApiCall({
				endpoint: 'antennas/test',
				parameters: { ...defaultParam, keywordMode: 'literal', keywords: [['バナナ|りんご[0-9]+円']] },
				user: alice,
			});
			assert.ok(!literal.some((x: Note) => x.text === 'りんご100円'));

			await failedApiCall({
				endpoint: 'antennas/test',
				parameters: { ...defaultParam, keywordMode: 'regex', keywords: [['(unclosed']] },
				user: alice,
			}, {
				status: 400,
				code: 'INVALID_REGEX',
				id: '0718cd93-e139-48f9-8107-2f5b24ad3669',
			});
		});
	});

	describe('のノート', () => {
		//#region アンテナのノート取得(antennas/notes)

		test('を取得できること。', async () => {
			const keyword = '取得キーワード';
			// アンテナ作成より前のノートも、現在の条件に合えば TL に出る (試し打ちと一致させるため)
			const beforeNote = await post(bob, { text: `test ${keyword} beforehand` });
			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywords: [[keyword]] },
				user: alice,
			});
			const note = await post(bob, { text: `test ${keyword}` });
			const response = await successfulApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: antenna.id },
				user: alice,
			});
			const expected = [note, beforeNote];
			assert.deepStrictEqual(response, expected);
		});

		test('から指定したノートだけ削除でき、ノート本体や他人のアンテナには影響しないこと。', async () => {
			const keyword = '削除キーワード';
			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywords: [[keyword]] },
				user: alice,
			});
			const otherAntenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywords: [[keyword]] },
				user: bob,
			});
			const remainingNote = await post(bob, { text: `test ${keyword} remaining` });
			const removedNote = await post(bob, { text: `test ${keyword} removed` });

			await successfulApiCall({
				endpoint: 'antennas/remove-note',
				parameters: { antennaId: antenna.id, noteId: removedNote.id },
				user: alice,
			});

			const response = await successfulApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: antenna.id },
				user: alice,
			});
			assert.deepStrictEqual(response, [remainingNote]);

			const note = await successfulApiCall({
				endpoint: 'notes/show',
				parameters: { noteId: removedNote.id },
				user: alice,
			});
			assert.deepStrictEqual(note, removedNote);

			const otherResponse = await successfulApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: otherAntenna.id },
				user: bob,
			});
			assert.deepStrictEqual(otherResponse, [removedNote, remainingNote]);
		});

		test('から存在しないノートを削除しても成功すること。', async () => {
			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: defaultParam,
				user: alice,
			});

			await successfulApiCall({
				endpoint: 'antennas/remove-note',
				parameters: { antennaId: antenna.id, noteId: 'doesnotexist' },
				user: alice,
			});
		});

		test('から他人のアンテナを指定してノートを削除できないこと。', async () => {
			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: defaultParam,
				user: alice,
			});

			await failedApiCall({
				endpoint: 'antennas/remove-note',
				parameters: { antennaId: antenna.id, noteId: alicePost.id },
				user: bob,
			}, {
				status: 400,
				code: 'NO_SUCH_ANTENNA',
				id: '850926e0-fd3b-49b6-b69a-b28a5dbd82fe',
			});
		});

		// 各ケースが固有のキーワードを使う。
		// TL はアンテナ作成前のノートも補完するので、同じキーワードを共有すると
		// 前のケースが投稿したノートまで拾ってしまう
		test.each([
			{
				label: '全体から',
				parameters: () => ({ src: 'all' }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(alice, { text: `${kw}` }), included: true },
					{ note: (kw: string): Promise<Note> => post(userFollowedByAlice, { text: `${kw}` }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw}` }), included: true },
					{ note: (kw: string): Promise<Note> => post(carol, { text: `test ${kw}` }), included: true },
				],
			},
			{
				// BUG e4144a1 以降home指定は壊れている(allと同じ)
				label: 'ホーム指定はallと同じ',
				parameters: () => ({ src: 'home' }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(alice, { text: `${kw}` }), included: true },
					{ note: (kw: string): Promise<Note> => post(userFollowedByAlice, { text: `${kw}` }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw}` }), included: true },
					{ note: (kw: string): Promise<Note> => post(carol, { text: `test ${kw}` }), included: true },
				],
			},
			{
				label: 'フォロワー限定投稿とDM投稿を含む',
				parameters: () => ({}),
				posts: [
					{ note: (kw: string): Promise<Note> => post(userFollowedByAlice, { text: `${kw}`, visibility: 'public' }), included: true },
					{ note: (kw: string): Promise<Note> => post(userFollowedByAlice, { text: `${kw}`, visibility: 'home' }), included: true },
					{ note: (kw: string): Promise<Note> => post(userFollowedByAlice, { text: `${kw}`, visibility: 'followers' }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw}`, visibility: 'specified', visibleUserIds: [alice.id] }), included: true },
				],
			},
			{
				label: 'フォロワー限定投稿とDM投稿を含まない',
				parameters: () => ({}),
				posts: [
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw}`, visibility: 'public' }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw}`, visibility: 'home' }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw}`, visibility: 'followers' }) },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw}`, visibility: 'specified', visibleUserIds: [carol.id] }) },
				],
			},
			{
				label: 'ブロックしているユーザーのノートは含む',
				parameters: () => ({}),
				posts: [
					{ note: (kw: string): Promise<Note> => post(userBlockedByAlice, { text: `${kw}` }), included: true },
				],
			},
			{
				label: 'ブロックされているユーザーのノートは含まない',
				parameters: () => ({}),
				posts: [
					{ note: (kw: string): Promise<Note> => post(userBlockingAlice, { text: `${kw}` }) },
				],
			},
			{
				label: 'ミュートしているユーザーのノートは含まない',
				parameters: () => ({}),
				posts: [
					{ note: (kw: string): Promise<Note> => post(userMutedByAlice, { text: `${kw}` }) },
				],
			},
			{
				label: 'ミュートされているユーザーのノートは含む',
				parameters: () => ({}),
				posts: [
					{ note: (kw: string): Promise<Note> => post(userMutingAlice, { text: `${kw}` }), included: true },
				],
			},
			{
				label: '「見つけやすくする」がOFFのユーザーのノートも含まれる',
				parameters: () => ({}),
				posts: [
					{ note: (kw: string): Promise<Note> => post(userNotExplorable, { text: `${kw}` }), included: true },
				],
			},
			{
				label: '鍵付きユーザーのノートも含まれる',
				parameters: () => ({}),
				posts: [
					{ note: (kw: string): Promise<Note> => post(userLocking, { text: `${kw}` }), included: true },
				],
			},
			{
				label: 'サイレンスのノートも含まれる',
				parameters: () => ({}),
				posts: [
					{ note: (kw: string): Promise<Note> => post(userSilenced, { text: `${kw}` }), included: true },
				],
			},
			{
				label: '削除ユーザーのノートも含まれる',
				parameters: () => ({}),
				posts: [
					{ note: (kw: string): Promise<Note> => post(userDeletedBySelf, { text: `${kw}` }), included: true },
					{ note: (kw: string): Promise<Note> => post(userDeletedByAdmin, { text: `${kw}` }), included: true },
				],
			},
			{
				label: 'ユーザー指定で',
				parameters: () => ({ src: 'users', users: [`@${bob.username}`, `@${carol.username}`] }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(alice, { text: `test ${kw}` }) },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw}` }), included: true },
					{ note: (kw: string): Promise<Note> => post(carol, { text: `test ${kw}` }), included: true },
				],
			},
			{
				label: 'リスト指定で',
				parameters: () => ({ src: 'list', userListId: aliceList.id }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(alice, { text: `test ${kw}` }) },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw}` }), included: true },
					{ note: (kw: string): Promise<Note> => post(carol, { text: `test ${kw}` }), included: true },
				],
			},
			{
				label: 'CWにもマッチする',
				parameters: (kw: string) => ({ keywords: [[kw]] }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(bob, { text: 'test', cw: `cw ${kw}` }), included: true },
				],
			},
			{
				label: 'キーワード1つ',
				parameters: (kw: string) => ({ keywords: [[kw]] }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(alice, { text: 'test' }) },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw}` }), included: true },
					{ note: (kw: string): Promise<Note> => post(carol, { text: 'test' }) },
				],
			},
			{
				label: 'キーワード3つ(AND)',
				parameters: () => ({ keywords: [['alpha', 'bravo', 'charlie']] }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(bob, { text: 'test alpha' }) },
					{ note: (kw: string): Promise<Note> => post(bob, { text: 'test alpha bravo' }) },
					{ note: (kw: string): Promise<Note> => post(bob, { text: 'test bravo charlie' }) },
					{ note: (kw: string): Promise<Note> => post(bob, { text: 'test alpha bravo charlie' }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: 'test charlie bravo alpha alpha bravo charlie' }), included: true },
				],
			},
			{
				label: 'キーワード3つ(OR)',
				parameters: () => ({ keywords: [['àlpha'], ['bràvo'], ['chàrlie']] }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(bob, { text: 'test' }) },
					{ note: (kw: string): Promise<Note> => post(bob, { text: 'test àlpha' }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: 'test àlpha bràvo' }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: 'test bràvo chàrlie' }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: 'test bràvo chàrlie àlpha' }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: 'test chàrlie bràvo' }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: 'test chàrlie' }), included: true },
				],
			},
			{
				label: '除外ワード3つ(AND)',
				parameters: () => ({ excludeKeywords: [['alpha', 'bravo', 'charlie']] }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw}` }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw} alpha` }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw} alpha bravo` }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw} bravo charlie` }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw} bravo charlie alpha` }) },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw} charlie bravo` }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw} charlie` }), included: true },
				],
			},
			{
				label: '除外ワード3つ(OR)',
				parameters: () => ({ excludeKeywords: [['xàlpha'], ['xbràvo'], ['xchàrlie']] }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw}` }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw} xàlpha` }) },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw} xàlpha xbràvo` }) },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw} xbràvo xchàrlie` }) },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw} xbràvo xchàrlie xàlpha` }) },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw} xchàrlie xbràvo` }) },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw} xchàrlie` }) },
				],
			},
			{
				label: 'キーワード1つ(大文字小文字区別する)',
				parameters: () => ({ keywords: [['CasedOne']], caseSensitive: true }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(bob, { text: 'casedone' }) },
					{ note: (kw: string): Promise<Note> => post(bob, { text: 'cAsEdOnE' }) },
					{ note: (kw: string): Promise<Note> => post(bob, { text: 'CasedOne' }), included: true },
				],
			},
			{
				label: 'キーワード1つ(大文字小文字区別しない)',
				parameters: () => ({ keywords: [['CasedTwo']], caseSensitive: false }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(bob, { text: 'casedtwo' }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: 'cAsEdTwO' }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: 'CasedTwo' }), included: true },
				],
			},
			{
				label: '除外ワード1つ(大文字小文字区別する)',
				parameters: () => ({ excludeKeywords: [['ExcludedOne']], caseSensitive: true }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw}` }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw} excludedone` }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw} eXcLuDeDoNe` }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw} ExcludedOne` }) },
				],
			},
			{
				label: '除外ワード1つ(大文字小文字区別しない)',
				parameters: () => ({ excludeKeywords: [['ExcludedTwo']], caseSensitive: false }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw}` }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw} excludedtwo` }) },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw} eXcLuDeDtWo` }) },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw} ExcludedTwo` }) },
				],
			},
			{
				label: '添付ファイルを問わない',
				parameters: () => ({ withFile: false }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw}`, fileIds: [bobFile.id] }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw}` }), included: true },
				],
			},
			{
				label: '添付ファイル付きのみ',
				parameters: () => ({ withFile: true }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw}`, fileIds: [bobFile.id] }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw}` }) },
				],
			},
			{
				label: 'リプライ以外',
				parameters: () => ({ withReplies: false }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw}`, replyId: alicePost.id }) },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw}` }), included: true },
				],
			},
			{
				label: 'リプライも含む',
				parameters: () => ({ withReplies: true }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw}`, replyId: alicePost.id }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw}` }), included: true },
				],
			},
			{
				label: 'チャンネルノートも含む',
				parameters: () => ({ src: 'all' }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw}`, channelId: testChannel.id }), included: true },
				],
			},
			{
				label: 'ミュートしてるチャンネルは含まない',
				parameters: () => ({ src: 'all' }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(bob, { text: `test ${kw}`, channelId: testMutedChannel.id }) },
				],
			},
			{
				label: 'フォロワーのみの投稿を取得',
				parameters: () => ({ onlyFollowers: true }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(alice, { text: `${kw}` }), included: true }, // 自分の投稿
					{ note: (kw: string): Promise<Note> => post(userFollowingAlice, { text: `${kw}` }), included: true }, // フォロワーの投稿
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw}` }) }, // 非フォロワーの投稿は除外
					{ note: (kw: string): Promise<Note> => post(userFollowedByAlice, { text: `${kw}` }) }, // フォロー先の投稿は除外
				],
			},
			{
				label: 'フォロワー制限なしの投稿を取得',
				parameters: () => ({ onlyFollowers: false }),
				posts: [
					{ note: (kw: string): Promise<Note> => post(alice, { text: `${kw}` }), included: true },
					{ note: (kw: string): Promise<Note> => post(userFollowingAlice, { text: `${kw}` }), included: true },
					{ note: (kw: string): Promise<Note> => post(bob, { text: `${kw}` }), included: true },
					{ note: (kw: string): Promise<Note> => post(userFollowedByAlice, { text: `${kw}` }), included: true },
				],
			},
		])('が取得できること（$label）', async ({ label, parameters, posts }) => {
			// ケースごとに固有のキーワードを使い、他のケースの投稿を拾わないようにする
			const keyword = `条件-${label}`;
			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				// parameters() が keywords を指定しないケース(withFile など)でも
				// そのケース固有のキーワードで判定するよう、既定値をあとから上書きする
				parameters: { ...defaultParam, keywords: [[keyword]] as string[][], ...parameters(keyword) },
				user: alice,
			});

			const notes = await posts.reduce(async (prev, current) => {
				// includedに関わらずnote()は評価して投稿する。
				const p = await prev;
				const n = await current.note(keyword);
				if (current.included) return p.concat(n);
				return p;
			}, Promise.resolve([] as Note[]));

			// alice視点でNoteを取り直す
			const expected = await Promise.all(notes.reverse().map(s => successfulApiCall({
				endpoint: 'notes/show',
				parameters: { noteId: s.id },
				user: alice,
			})));

			const response = await successfulApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: antenna.id },
				user: alice,
			});
			assert.deepStrictEqual(
				response.map(({ userId, id, text }) => ({ userId, id, text })),
				expected.map(({ userId, id, text }) => ({ userId, id, text })));
			assert.deepStrictEqual(response, expected);
		});

		test('が取得できること（センシティブチャンネルのノートを除く）', async () => {
			const keyword = 'センシティブキーワード';
			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywords: [[keyword]], excludeNotesInSensitiveChannel: true },
				user: alice,
			});
			const nonSensitiveChannel = await successfulApiCall({
				endpoint: 'channels/create',
				parameters: { name: 'test', isSensitive: false },
				user: alice,
			});
			const sensitiveChannel = await successfulApiCall({
				endpoint: 'channels/create',
				parameters: { name: 'test', isSensitive: true },
				user: alice,
			});

			const noteInLocal = await post(bob, { text: `test ${keyword}` });
			const noteInNonSensitiveChannel = await post(bob, { text: `test ${keyword}`, channelId: nonSensitiveChannel.id });
			await post(bob, { text: `test ${keyword}`, channelId: sensitiveChannel.id });

			const response = await successfulApiCall({
				endpoint: 'antennas/notes',
				parameters: { antennaId: antenna.id },
				user: alice,
			});
			// 最後に投稿したものが先頭に来る。
			const expected = [
				noteInNonSensitiveChannel,
				noteInLocal,
			];
			assert.deepStrictEqual(response, expected);
		});

		test.skip('が取得でき、日付指定のPaginationに一貫性があること', async () => { });
		test.each([
			{ label: 'ID指定', offsetBy: 'id' },

			// BUG sinceDate, untilDateはsinceIdや他のエンドポイントとは異なり、その時刻に一致するレコードを含んでしまう。
			// { label: '日付指定', offsetBy: 'createdAt' },
		] as const)('が取得でき、$labelのPaginationに一貫性があること', async ({ offsetBy }) => {
			const keyword = 'ページング一貫キーワード';
			const antenna = await successfulApiCall({
				endpoint: 'antennas/create',
				parameters: { ...defaultParam, keywords: [[keyword]] },
				user: alice,
			});
			const notes = await [...Array(30)].reduce(async (prev, current, index) => {
				const p = await prev;
				const n = await post(alice, { text: `${keyword} (${index})` });
				return [n].concat(p);
			}, Promise.resolve([] as Note[]));

			// antennas/notesは降順のみで、昇順をサポートしない。
			await testPaginationConsistency(notes, async (paginationParam) => {
				return successfulApiCall({
					endpoint: 'antennas/notes',
					parameters: { antennaId: antenna.id, ...paginationParam },
					user: alice,
				});
			}, offsetBy, 'desc');
		});

		// BUG 7日過ぎると作り直すしかない。 https://github.com/misskey-dev/misskey/issues/10476
		test.todo('を取得したときActiveに戻る');

		//#endregion
	});
});
