/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { describe, beforeAll, test, vi } from 'vitest';
import { UserToken, api, failedApiCall, hiddenNote, post, react, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

const waitForPushToTlOptions = { timeout: 3000, interval: 25 };

describe('API visibility', () => {
	describe('default sign-in requirement', () => {
		let user: misskey.entities.SignupResponse;
		let note: misskey.entities.Note;

		beforeAll(async () => {
			user = await signup({ username: 'defaultGate' });
			note = await post(user, { text: 'default sign-in gate' });
		});

		test('unauthenticated notes/show returns the exact content restriction error', async () => {
			await failedApiCall({
				endpoint: 'notes/show',
				parameters: { noteId: note.id },
				user: undefined,
			}, {
				status: 400,
				code: 'CONTENT_RESTRICTED_BY_USER',
				id: 'fbcc002d-37d9-4944-a6b0-d9e29f2d33ab',
			});
		});
	});

	describe('Note visibility', () => {
		//#region vars
		/** ヒロイン */
		let alice: misskey.entities.SignupResponse;
		/** フォロワー */
		let follower: misskey.entities.SignupResponse;
		/** 非フォロワー */
		let other: misskey.entities.SignupResponse;
		/** 非フォロワーでもリプライやメンションをされた人 */
		let target: misskey.entities.SignupResponse;
		/** specified mentionでmentionを飛ばされる人 */
		let target2: misskey.entities.SignupResponse;

		/** public-post */
		let pub: misskey.entities.Note;
		/** home-post */
		let home: misskey.entities.Note;
		/** followers-post */
		let fol: misskey.entities.Note;
		/** specified-post */
		let spe: misskey.entities.Note;

		/** public-reply to target's post */
		let pubR: misskey.entities.Note;
		/** home-reply to target's post */
		let homeR: misskey.entities.Note;
		/** followers-reply to target's post */
		let folR: misskey.entities.Note;
		/** specified-reply to target's post */
		let speR: misskey.entities.Note;

		/** public-mention to target */
		let pubM: misskey.entities.Note;
		/** home-mention to target */
		let homeM: misskey.entities.Note;
		/** followers-mention to target */
		let folM: misskey.entities.Note;
		/** specified-mention to target */
		let speM: misskey.entities.Note;

		/** reply target post */
		let tgt: misskey.entities.Note;
		//#endregion

		const show = async (noteId: misskey.entities.Note['id'], by?: UserToken) => {
			return await api('notes/show', {
				noteId,
			}, by);
		};

		const assertHiddenNote = (actual: misskey.entities.Note, source: misskey.entities.Note, includeDeliveryTargets = false) => {
			const expected = hiddenNote(source, { includeDeliveryTargets });
			assert.strictEqual(actual.id, expected.id);
			assert.strictEqual(actual.isHidden, expected.isHidden);
			assert.strictEqual(actual.text, expected.text);
			assert.strictEqual(actual.cw, expected.cw);
			assert.deepStrictEqual(actual.fileIds, expected.fileIds);
			assert.deepStrictEqual(actual.files, expected.files);
			assert.strictEqual('visibleUserIds' in actual, false);
			assert.strictEqual('poll' in actual, false);
			if (includeDeliveryTargets) {
				assert.deepStrictEqual(actual.deliveryTargets, expected.deliveryTargets);
			} else {
				assert.strictEqual('deliveryTargets' in actual, false);
			}
		};

		beforeAll(async () => {
			//#region prepare
			// signup
			alice = await signup({ username: 'alice' });
			follower = await signup({ username: 'follower' });
			other = await signup({ username: 'other' });
			target = await signup({ username: 'target' });
			target2 = await signup({ username: 'target2' });

			// Keep the visibility matrix focused on note visibility rather than the
			// server's sign-in requirement, which is covered by the dedicated regression above.
			assert.strictEqual((await api('i/update', { requireSigninToViewContents: false }, alice)).status, 200);

			// follow alice <= follower
			await api('following/create', { userId: alice.id }, follower);

			// normal posts
			pub = await post(alice, { text: 'x', visibility: 'public' });
			home = await post(alice, { text: 'x', visibility: 'home' });
			fol = await post(alice, { text: 'x', visibility: 'followers' });
			spe = await post(alice, { text: 'x', visibility: 'specified', visibleUserIds: [target.id] });

			// replies
			tgt = await post(target, { text: 'y', visibility: 'public' });
			pubR = await post(alice, { text: 'x', replyId: tgt.id, visibility: 'public' });
			homeR = await post(alice, { text: 'x', replyId: tgt.id, visibility: 'home' });
			folR = await post(alice, { text: 'x', replyId: tgt.id, visibility: 'followers' });
			speR = await post(alice, { text: 'x', replyId: tgt.id, visibility: 'specified' });

			// mentions
			pubM = await post(alice, { text: '@target x', replyId: tgt.id, visibility: 'public' });
			homeM = await post(alice, { text: '@target x', replyId: tgt.id, visibility: 'home' });
			folM = await post(alice, { text: '@target x', replyId: tgt.id, visibility: 'followers' });
			speM = await post(alice, { text: '@target2 x', replyId: tgt.id, visibility: 'specified' });
			//#endregion
		});

		//#region show post
		// public
		test('[show] public-postを自分が見れる', async () => {
			const res = await show(pub.id, alice);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] public-postをフォロワーが見れる', async () => {
			const res = await show(pub.id, follower);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] public-postを非フォロワーが見れる', async () => {
			const res = await show(pub.id, other);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] public-postを未認証が見れる', async () => {
			const res = await show(pub.id);
			assert.strictEqual(res.body.text, 'x');
		});

		// home
		test('[show] home-postを自分が見れる', async () => {
			const res = await show(home.id, alice);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] home-postをフォロワーが見れる', async () => {
			const res = await show(home.id, follower);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] home-postを非フォロワーが見れる', async () => {
			const res = await show(home.id, other);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] home-postを未認証が見れる', async () => {
			const res = await show(home.id);
			assert.strictEqual(res.body.text, 'x');
		});

		// followers
		test('[show] followers-postを自分が見れる', async () => {
			const res = await show(fol.id, alice);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] followers-postをフォロワーが見れる', async () => {
			const res = await show(fol.id, follower);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] followers-postを非フォロワーが見れない', async () => {
			const res = await show(fol.id, other);
			assertHiddenNote(res.body, fol, true);
		});

		test('[show] followers-postを未認証が見れない', async () => {
			const res = await show(fol.id);
			assertHiddenNote(res.body, fol);
		});

		// specified
		test('[show] specified-postを自分が見れる', async () => {
			const res = await show(spe.id, alice);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] specified-postを指定ユーザーが見れる', async () => {
			const res = await show(spe.id, target);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] specified-postをフォロワーが見れない', async () => {
			const res = await show(spe.id, follower);
			assertHiddenNote(res.body, spe, true);
		});

		test('[show] specified-postを非フォロワーが見れない', async () => {
			const res = await show(spe.id, other);
			assertHiddenNote(res.body, spe, true);
		});

		test('[show] specified-postを未認証が見れない', async () => {
			const res = await show(spe.id);
			assertHiddenNote(res.body, spe);
		});
		//#endregion

		//#region show reply
		// public
		test('[show] public-replyを自分が見れる', async () => {
			const res = await show(pubR.id, alice);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] public-replyをされた人が見れる', async () => {
			const res = await show(pubR.id, target);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] public-replyをフォロワーが見れる', async () => {
			const res = await show(pubR.id, follower);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] public-replyを非フォロワーが見れる', async () => {
			const res = await show(pubR.id, other);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] public-replyを未認証が見れる', async () => {
			const res = await show(pubR.id);
			assert.strictEqual(res.body.text, 'x');
		});

		// home
		test('[show] home-replyを自分が見れる', async () => {
			const res = await show(homeR.id, alice);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] home-replyをされた人が見れる', async () => {
			const res = await show(homeR.id, target);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] home-replyをフォロワーが見れる', async () => {
			const res = await show(homeR.id, follower);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] home-replyを非フォロワーが見れる', async () => {
			const res = await show(homeR.id, other);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] home-replyを未認証が見れる', async () => {
			const res = await show(homeR.id);
			assert.strictEqual(res.body.text, 'x');
		});

		// followers
		test('[show] followers-replyを自分が見れる', async () => {
			const res = await show(folR.id, alice);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] followers-replyを非フォロワーでもリプライされていれば見れる', async () => {
			const res = await show(folR.id, target);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] followers-replyをフォロワーが見れる', async () => {
			const res = await show(folR.id, follower);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] followers-replyを非フォロワーが見れない', async () => {
			const res = await show(folR.id, other);
			assertHiddenNote(res.body, folR, true);
		});

		test('[show] followers-replyを未認証が見れない', async () => {
			const res = await show(folR.id);
			assertHiddenNote(res.body, folR);
		});

		// specified
		test('[show] specified-replyを自分が見れる', async () => {
			const res = await show(speR.id, alice);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] specified-replyを指定ユーザーが見れる', async () => {
			const res = await show(speR.id, target);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] specified-replyをされた人が指定されてなくても見れる', async () => {
			const res = await show(speR.id, target);
			assert.strictEqual(res.body.text, 'x');
		});

		test('[show] specified-replyをフォロワーが見れない', async () => {
			const res = await show(speR.id, follower);
			assertHiddenNote(res.body, speR, true);
		});

		test('[show] specified-replyを非フォロワーが見れない', async () => {
			const res = await show(speR.id, other);
			assertHiddenNote(res.body, speR, true);
		});

		test('[show] specified-replyを未認証が見れない', async () => {
			const res = await show(speR.id);
			assertHiddenNote(res.body, speR);
		});
		//#endregion

		//#region show mention
		// public
		test('[show] public-mentionを自分が見れる', async () => {
			const res = await show(pubM.id, alice);
			assert.strictEqual(res.body.text, '@target x');
		});

		test('[show] public-mentionをされた人が見れる', async () => {
			const res = await show(pubM.id, target);
			assert.strictEqual(res.body.text, '@target x');
		});

		test('[show] public-mentionをフォロワーが見れる', async () => {
			const res = await show(pubM.id, follower);
			assert.strictEqual(res.body.text, '@target x');
		});

		test('[show] public-mentionを非フォロワーが見れる', async () => {
			const res = await show(pubM.id, other);
			assert.strictEqual(res.body.text, '@target x');
		});

		test('[show] public-mentionを未認証が見れる', async () => {
			const res = await show(pubM.id);
			assert.strictEqual(res.body.text, '@target x');
		});

		// home
		test('[show] home-mentionを自分が見れる', async () => {
			const res = await show(homeM.id, alice);
			assert.strictEqual(res.body.text, '@target x');
		});

		test('[show] home-mentionをされた人が見れる', async () => {
			const res = await show(homeM.id, target);
			assert.strictEqual(res.body.text, '@target x');
		});

		test('[show] home-mentionをフォロワーが見れる', async () => {
			const res = await show(homeM.id, follower);
			assert.strictEqual(res.body.text, '@target x');
		});

		test('[show] home-mentionを非フォロワーが見れる', async () => {
			const res = await show(homeM.id, other);
			assert.strictEqual(res.body.text, '@target x');
		});

		test('[show] home-mentionを未認証が見れる', async () => {
			const res = await show(homeM.id);
			assert.strictEqual(res.body.text, '@target x');
		});

		// followers
		test('[show] followers-mentionを自分が見れる', async () => {
			const res = await show(folM.id, alice);
			assert.strictEqual(res.body.text, '@target x');
		});

		test('[show] followers-mentionをメンションされていれば非フォロワーでも見れる', async () => {
			const res = await show(folM.id, target);
			assert.strictEqual(res.body.text, '@target x');
		});

		test('[show] followers-mentionをフォロワーが見れる', async () => {
			const res = await show(folM.id, follower);
			assert.strictEqual(res.body.text, '@target x');
		});

		test('[show] followers-mentionを非フォロワーが見れない', async () => {
			const res = await show(folM.id, other);
			assertHiddenNote(res.body, folM, true);
		});

		test('[show] followers-mentionを未認証が見れない', async () => {
			const res = await show(folM.id);
			assertHiddenNote(res.body, folM);
		});

		// specified
		test('[show] specified-mentionを自分が見れる', async () => {
			const res = await show(speM.id, alice);
			assert.strictEqual(res.body.text, '@target2 x');
		});

		test('[show] specified-mentionを指定ユーザーが見れる', async () => {
			const res = await show(speM.id, target);
			assert.strictEqual(res.body.text, '@target2 x');
		});

		test('[show] specified-mentionをされた人が指定されてなかったら見れない', async () => {
			const res = await show(speM.id, target2);
			assertHiddenNote(res.body, speM, true);
		});

		test('[show] specified-mentionをフォロワーが見れない', async () => {
			const res = await show(speM.id, follower);
			assertHiddenNote(res.body, speM, true);
		});

		test('[show] specified-mentionを非フォロワーが見れない', async () => {
			const res = await show(speM.id, other);
			assertHiddenNote(res.body, speM, true);
		});

		test('[show] specified-mentionを未認証が見れない', async () => {
			const res = await show(speM.id);
			assertHiddenNote(res.body, speM);
		});
		//#endregion

		//#region reactions
		describe('reactions', () => {
			/** notes/reactions の noSuchNote エラー id */
			const noSuchNote = '263fff3d-d0e1-4af4-bea7-8408059b451a';

			const reactions = async (noteId: misskey.entities.Note['id'], by?: UserToken) => {
				return await api('notes/reactions', { noteId }, by);
			};

			const cannotSeeReactions = async (noteId: misskey.entities.Note['id'], by?: UserToken) => {
				return await failedApiCall({
					endpoint: 'notes/reactions',
					parameters: { noteId },
					user: by,
				}, {
					status: 400,
					code: 'NO_SUCH_NOTE',
					id: noSuchNote,
				});
			};

			beforeAll(async () => {
				await react(follower, pub, '👍');
				await react(follower, fol, '👍');
				await react(target, spe, '👍');
				await react(follower, folR, '👍');
			});

			test('[reactions] public-postのリアクションを未認証から見ると空になる', async () => {
				const res = await reactions(pub.id);
				assert.strictEqual(res.status, 200);
				assert.deepStrictEqual(res.body, []);
			});

			test('[reactions] followers-postのリアクションを自分が見れる', async () => {
				const res = await reactions(fol.id, alice);
				assert.strictEqual(res.status, 200);
				assert.strictEqual(res.body.length, 1);
			});

			test('[reactions] followers-postのリアクションをフォロワーが見れる', async () => {
				const res = await reactions(fol.id, follower);
				assert.strictEqual(res.status, 200);
				assert.strictEqual(res.body.length, 1);
			});

			test('[reactions] followers-postのリアクションを非フォロワーが見れない', async () => {
				await cannotSeeReactions(fol.id, other);
			});

			test('[reactions] followers-postのリアクションを未認証から見ると空になる', async () => {
				const res = await reactions(fol.id);
				assert.strictEqual(res.status, 200);
				assert.deepStrictEqual(res.body, []);
			});

			test('[reactions] specified-postのリアクションを指定ユーザーが見れる', async () => {
				const res = await reactions(spe.id, target);
				assert.strictEqual(res.status, 200);
				assert.strictEqual(res.body.length, 1);
			});

			test('[reactions] specified-postのリアクションをフォロワーが見れない', async () => {
				await cannotSeeReactions(spe.id, follower);
			});

			test('[reactions] specified-postのリアクションを未認証から見ると空になる', async () => {
				const res = await reactions(spe.id);
				assert.strictEqual(res.status, 200);
				assert.deepStrictEqual(res.body, []);
			});

			test('[reactions] followers-replyのリアクションを非フォロワー (リプライ先である) が見れる', async () => {
				const res = await reactions(folR.id, target);
				assert.strictEqual(res.status, 200);
				assert.strictEqual(res.body.length, 1);
			});

			test('[reactions] followers-replyのリアクションを非フォロワー (リプライ先ではない) が見れない', async () => {
				await cannotSeeReactions(folR.id, other);
			});

			test('[reactions] 存在しないノートのリアクションは見れない', async () => {
				await cannotSeeReactions('foo', alice);
			});
		});
		//#endregion

		//#region HTL
		test('[HTL] public-post が 自分が見れる', async () => {
			await vi.waitFor(async () => {
				const res = await api('notes/timeline', { limit: 100 }, alice);
				assert.strictEqual(res.status, 200);
				const notes = res.body.filter(n => n.id === pub.id);
				assert.strictEqual(notes[0].text, 'x');
			}, waitForPushToTlOptions);
		});

		test('[HTL] public-post が 非フォロワーから見れない', async () => {
			const res = await api('notes/timeline', { limit: 100 }, other);
			assert.strictEqual(res.status, 200);
			const notes = res.body.filter(n => n.id === pub.id);
			assert.strictEqual(notes.length, 0);
		});

		test('[HTL] followers-post が フォロワーから見れる', async () => {
			await vi.waitFor(async () => {
				const res = await api('notes/timeline', { limit: 100 }, follower);
				assert.strictEqual(res.status, 200);
				const notes = res.body.filter(n => n.id === fol.id);
				assert.strictEqual(notes[0].text, 'x');
			}, waitForPushToTlOptions);
		});
		//#endregion

		//#region RTL
		test('[replies] followers-reply が フォロワーから見れる', async () => {
			const res = await api('notes/replies', { noteId: tgt.id, limit: 100 }, follower);
			assert.strictEqual(res.status, 200);
			const notes = res.body.filter(n => n.id === folR.id);
			assert.strictEqual(notes[0].text, 'x');
		});

		test('[replies] followers-reply が 非フォロワー (リプライ先ではない) から見れない', async () => {
			const res = await api('notes/replies', { noteId: tgt.id, limit: 100 }, other);
			assert.strictEqual(res.status, 200);
			const notes = res.body.filter(n => n.id === folR.id);
			assert.strictEqual(notes.length, 0);
		});

		test('[replies] followers-reply が 非フォロワー (リプライ先である) から見れる', async () => {
			const res = await api('notes/replies', { noteId: tgt.id, limit: 100 }, target);
			assert.strictEqual(res.status, 200);
			const notes = res.body.filter(n => n.id === folR.id);
			assert.strictEqual(notes[0].text, 'x');
		});
		//#endregion

		//#region MTL
		test('[mentions] followers-reply が 非フォロワー (リプライ先である) から見れる', async () => {
			const res = await api('notes/mentions', { limit: 100 }, target);
			assert.strictEqual(res.status, 200);
			const notes = res.body.filter(n => n.id === folR.id);
			assert.strictEqual(notes[0].text, 'x');
		});

		test('[mentions] followers-mention が 非フォロワー (メンション先である) から見れる', async () => {
			const res = await api('notes/mentions', { limit: 100 }, target);
			assert.strictEqual(res.status, 200);
			const notes = res.body.filter(n => n.id === folM.id);
			assert.strictEqual(notes[0].text, '@target x');
		});
		//#endregion
	});
});

