/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { describe, beforeAll, test } from 'vitest';
import { api, failedApiCall, signup, simpleGet } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('FF visibility', () => {
	let root: misskey.entities.SignupResponse;
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;

	const followingForbidden = {
		status: 400,
		code: 'FORBIDDEN',
		id: 'f6cdb0df-c19f-ec5c-7dbb-0ba84a1f92ba',
	} as const;
	const followersForbidden = {
		status: 400,
		code: 'FORBIDDEN',
		id: '3c6a84db-d619-26af-ca14-06232a21df8a',
	} as const;
	const credentialRequired = {
		status: 401,
		code: 'CREDENTIAL_REQUIRED',
		id: '1384574d-a912-4b81-8601-c7b1c4085df1',
	} as const;

	const assertFollowingForbidden = async (user: misskey.entities.SignupResponse) => {
		await failedApiCall({
			endpoint: 'users/following',
			parameters: { userId: alice.id },
			user,
		}, followingForbidden);
	};

	const assertFollowersForbidden = async (user: misskey.entities.SignupResponse) => {
		await failedApiCall({
			endpoint: 'users/followers',
			parameters: { userId: alice.id },
			user,
		}, followersForbidden);
	};

	beforeAll(async () => {
		root = await signup({ username: 'root01' });
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob01' });
		assert.strictEqual((await api('admin/update-meta', { federation: 'all' }, root)).status, 204);
	}, 1000 * 60 * 2);

	test('users/following requires credentials', async () => {
		await failedApiCall({
			endpoint: 'users/following',
			parameters: { userId: alice.id },
			user: undefined,
		}, credentialRequired);
	});

	test('users/followers requires credentials', async () => {
		await failedApiCall({
			endpoint: 'users/followers',
			parameters: { userId: alice.id },
			user: undefined,
		}, credentialRequired);
	});

	test('followingVisibility, followersVisibility がともに public なユーザーのフォロー/フォロワーを誰でも見れる', async () => {
		await api('i/update', {
			followingVisibility: 'public',
			followersVisibility: 'public',
		}, alice);

		const followingRes = await api('users/following', {
			userId: alice.id,
		}, bob);
		const followersRes = await api('users/followers', {
			userId: alice.id,
		}, bob);

		assert.strictEqual(followingRes.status, 200);
		assert.strictEqual(Array.isArray(followingRes.body), true);
		assert.strictEqual(followersRes.status, 200);
		assert.strictEqual(Array.isArray(followersRes.body), true);
	});

	test('followingVisibility が public であれば followersVisibility の設定に関わらずユーザーのフォローを誰でも見れる', async () => {
		{
			await api('i/update', {
				followingVisibility: 'public',
				followersVisibility: 'public',
			}, alice);

			const followingRes = await api('users/following', {
				userId: alice.id,
			}, bob);
			assert.strictEqual(followingRes.status, 200);
			assert.strictEqual(Array.isArray(followingRes.body), true);
		}
		{
			await api('i/update', {
				followingVisibility: 'public',
				followersVisibility: 'followers',
			}, alice);

			const followingRes = await api('users/following', {
				userId: alice.id,
			}, bob);
			assert.strictEqual(followingRes.status, 200);
			assert.strictEqual(Array.isArray(followingRes.body), true);
		}
		{
			await api('i/update', {
				followingVisibility: 'public',
				followersVisibility: 'private',
			}, alice);

			const followingRes = await api('users/following', {
				userId: alice.id,
			}, bob);
			assert.strictEqual(followingRes.status, 200);
			assert.strictEqual(Array.isArray(followingRes.body), true);
		}
	});

	test('followersVisibility が public であれば followingVisibility の設定に関わらずユーザーのフォロワーを誰でも見れる', async () => {
		{
			await api('i/update', {
				followingVisibility: 'public',
				followersVisibility: 'public',
			}, alice);

			const followersRes = await api('users/followers', {
				userId: alice.id,
			}, bob);
			assert.strictEqual(followersRes.status, 200);
			assert.strictEqual(Array.isArray(followersRes.body), true);
		}
		{
			await api('i/update', {
				followingVisibility: 'followers',
				followersVisibility: 'public',
			}, alice);

			const followersRes = await api('users/followers', {
				userId: alice.id,
			}, bob);
			assert.strictEqual(followersRes.status, 200);
			assert.strictEqual(Array.isArray(followersRes.body), true);
		}
		{
			await api('i/update', {
				followingVisibility: 'private',
				followersVisibility: 'public',
			}, alice);

			const followersRes = await api('users/followers', {
				userId: alice.id,
			}, bob);
			assert.strictEqual(followersRes.status, 200);
			assert.strictEqual(Array.isArray(followersRes.body), true);
		}
	});

	test('followingVisibility, followersVisibility がともに followers なユーザーのフォロー/フォロワーを自分で見れる', async () => {
		await api('i/update', {
			followingVisibility: 'followers',
			followersVisibility: 'followers',
		}, alice);

		const followingRes = await api('users/following', {
			userId: alice.id,
		}, alice);
		const followersRes = await api('users/followers', {
			userId: alice.id,
		}, alice);

		assert.strictEqual(followingRes.status, 200);
		assert.strictEqual(Array.isArray(followingRes.body), true);
		assert.strictEqual(followersRes.status, 200);
		assert.strictEqual(Array.isArray(followersRes.body), true);
	});

	test('followingVisibility が followers なユーザーのフォローを followersVisibility の設定に関わらず自分で見れる', async () => {
		{
			await api('i/update', {
				followingVisibility: 'followers',
				followersVisibility: 'public',
			}, alice);

			const followingRes = await api('users/following', {
				userId: alice.id,
			}, alice);
			assert.strictEqual(followingRes.status, 200);
			assert.strictEqual(Array.isArray(followingRes.body), true);
		}
		{
			await api('i/update', {
				followingVisibility: 'followers',
				followersVisibility: 'followers',
			}, alice);

			const followingRes = await api('users/following', {
				userId: alice.id,
			}, alice);
			assert.strictEqual(followingRes.status, 200);
			assert.strictEqual(Array.isArray(followingRes.body), true);
		}
		{
			await api('i/update', {
				followingVisibility: 'followers',
				followersVisibility: 'private',
			}, alice);

			const followingRes = await api('users/following', {
				userId: alice.id,
			}, alice);
			assert.strictEqual(followingRes.status, 200);
			assert.strictEqual(Array.isArray(followingRes.body), true);
		}
	});

	test('followersVisibility が followers なユーザーのフォロワーを followingVisibility の設定に関わらず自分で見れる', async () => {
		{
			await api('i/update', {
				followingVisibility: 'public',
				followersVisibility: 'followers',
			}, alice);

			const followersRes = await api('users/followers', {
				userId: alice.id,
			}, alice);
			assert.strictEqual(followersRes.status, 200);
			assert.strictEqual(Array.isArray(followersRes.body), true);
		}
		{
			await api('i/update', {
				followingVisibility: 'followers',
				followersVisibility: 'followers',
			}, alice);

			const followersRes = await api('users/followers', {
				userId: alice.id,
			}, alice);
			assert.strictEqual(followersRes.status, 200);
			assert.strictEqual(Array.isArray(followersRes.body), true);
		}
		{
			await api('i/update', {
				followingVisibility: 'private',
				followersVisibility: 'followers',
			}, alice);

			const followersRes = await api('users/followers', {
				userId: alice.id,
			}, alice);
			assert.strictEqual(followersRes.status, 200);
			assert.strictEqual(Array.isArray(followersRes.body), true);
		}
	});

	test('followingVisibility, followersVisibility がともに followers なユーザーのフォロー/フォロワーを非フォロワーが見れない', async () => {
		await api('i/update', {
			followingVisibility: 'followers',
			followersVisibility: 'followers',
		}, alice);

		await assertFollowingForbidden(bob);
		await assertFollowersForbidden(bob);
	});

	test('followingVisibility が followers なユーザーのフォローを followersVisibility の設定に関わらず非フォロワーが見れない', async () => {
		{
			await api('i/update', {
				followingVisibility: 'followers',
				followersVisibility: 'public',
			}, alice);

			await assertFollowingForbidden(bob);
		}
		{
			await api('i/update', {
				followingVisibility: 'followers',
				followersVisibility: 'followers',
			}, alice);

			await assertFollowingForbidden(bob);
		}
		{
			await api('i/update', {
				followingVisibility: 'followers',
				followersVisibility: 'private',
			}, alice);

			await assertFollowingForbidden(bob);
		}
	});

	test('followersVisibility が followers なユーザーのフォロワーを followingVisibility の設定に関わらず非フォロワーが見れない', async () => {
		{
			await api('i/update', {
				followingVisibility: 'public',
				followersVisibility: 'followers',
			}, alice);

			await assertFollowersForbidden(bob);
		}
		{
			await api('i/update', {
				followingVisibility: 'followers',
				followersVisibility: 'followers',
			}, alice);

			await assertFollowersForbidden(bob);
		}
		{
			await api('i/update', {
				followingVisibility: 'private',
				followersVisibility: 'followers',
			}, alice);

			await assertFollowersForbidden(bob);
		}
	});

	test('followingVisibility, followersVisibility がともに followers なユーザーのフォロー/フォロワーをフォロワーが見れる', async () => {
		await api('i/update', {
			followingVisibility: 'followers',
			followersVisibility: 'followers',
		}, alice);

		await api('following/create', {
			userId: alice.id,
		}, bob);

		const followingRes = await api('users/following', {
			userId: alice.id,
		}, bob);
		const followersRes = await api('users/followers', {
			userId: alice.id,
		}, bob);

		assert.strictEqual(followingRes.status, 200);
		assert.strictEqual(Array.isArray(followingRes.body), true);
		assert.strictEqual(followersRes.status, 200);
		assert.strictEqual(Array.isArray(followersRes.body), true);
	});

	test('followingVisibility が followers なユーザーのフォローを followersVisibility の設定に関わらずフォロワーが見れる', async () => {
		{
			await api('i/update', {
				followingVisibility: 'followers',
				followersVisibility: 'public',
			}, alice);
			await api('following/create', {
				userId: alice.id,
			}, bob);

			const followingRes = await api('users/following', {
				userId: alice.id,
			}, bob);
			assert.strictEqual(followingRes.status, 200);
			assert.strictEqual(Array.isArray(followingRes.body), true);
		}
		{
			await api('i/update', {
				followingVisibility: 'followers',
				followersVisibility: 'followers',
			}, alice);
			await api('following/create', {
				userId: alice.id,
			}, bob);

			const followingRes = await api('users/following', {
				userId: alice.id,
			}, bob);
			assert.strictEqual(followingRes.status, 200);
			assert.strictEqual(Array.isArray(followingRes.body), true);
		}
		{
			await api('i/update', {
				followingVisibility: 'followers',
				followersVisibility: 'private',
			}, alice);
			await api('following/create', {
				userId: alice.id,
			}, bob);

			const followingRes = await api('users/following', {
				userId: alice.id,
			}, bob);
			assert.strictEqual(followingRes.status, 200);
			assert.strictEqual(Array.isArray(followingRes.body), true);
		}
	});

	test('followersVisibility が followers なユーザーのフォロワーを followingVisibility の設定に関わらずフォロワーが見れる', async () => {
		{
			await api('i/update', {
				followingVisibility: 'public',
				followersVisibility: 'followers',
			}, alice);
			await api('following/create', {
				userId: alice.id,
			}, bob);

			const followersRes = await api('users/followers', {
				userId: alice.id,
			}, bob);
			assert.strictEqual(followersRes.status, 200);
			assert.strictEqual(Array.isArray(followersRes.body), true);
		}
		{
			await api('i/update', {
				followingVisibility: 'followers',
				followersVisibility: 'followers',
			}, alice);
			await api('following/create', {
				userId: alice.id,
			}, bob);

			const followersRes = await api('users/followers', {
				userId: alice.id,
			}, bob);
			assert.strictEqual(followersRes.status, 200);
			assert.strictEqual(Array.isArray(followersRes.body), true);
		}
		{
			await api('i/update', {
				followingVisibility: 'private',
				followersVisibility: 'followers',
			}, alice);
			await api('following/create', {
				userId: alice.id,
			}, bob);

			const followersRes = await api('users/followers', {
				userId: alice.id,
			}, bob);
			assert.strictEqual(followersRes.status, 200);
			assert.strictEqual(Array.isArray(followersRes.body), true);
		}
	});

	test('followingVisibility, followersVisibility がともに private なユーザーのフォロー/フォロワーを自分で見れる', async () => {
		await api('i/update', {
			followingVisibility: 'private',
			followersVisibility: 'private',
		}, alice);

		const followingRes = await api('users/following', {
			userId: alice.id,
		}, alice);
		const followersRes = await api('users/followers', {
			userId: alice.id,
		}, alice);

		assert.strictEqual(followingRes.status, 200);
		assert.strictEqual(Array.isArray(followingRes.body), true);
		assert.strictEqual(followersRes.status, 200);
		assert.strictEqual(Array.isArray(followersRes.body), true);
	});

	test('followingVisibility が private なユーザーのフォローを followersVisibility の設定に関わらず自分で見れる', async () => {
		{
			await api('i/update', {
				followingVisibility: 'private',
				followersVisibility: 'public',
			}, alice);

			const followingRes = await api('users/following', {
				userId: alice.id,
			}, alice);
			assert.strictEqual(followingRes.status, 200);
			assert.strictEqual(Array.isArray(followingRes.body), true);
		}
		{
			await api('i/update', {
				followingVisibility: 'private',
				followersVisibility: 'followers',
			}, alice);

			const followingRes = await api('users/following', {
				userId: alice.id,
			}, alice);
			assert.strictEqual(followingRes.status, 200);
			assert.strictEqual(Array.isArray(followingRes.body), true);
		}
		{
			await api('i/update', {
				followingVisibility: 'private',
				followersVisibility: 'private',
			}, alice);

			const followingRes = await api('users/following', {
				userId: alice.id,
			}, alice);
			assert.strictEqual(followingRes.status, 200);
			assert.strictEqual(Array.isArray(followingRes.body), true);
		}
	});

	test('followersVisibility が private なユーザーのフォロワーを followingVisibility の設定に関わらず自分で見れる', async () => {
		{
			await api('i/update', {
				followingVisibility: 'public',
				followersVisibility: 'private',
			}, alice);

			const followersRes = await api('users/followers', {
				userId: alice.id,
			}, alice);
			assert.strictEqual(followersRes.status, 200);
			assert.strictEqual(Array.isArray(followersRes.body), true);
		}
		{
			await api('i/update', {
				followingVisibility: 'followers',
				followersVisibility: 'private',
			}, alice);

			const followersRes = await api('users/followers', {
				userId: alice.id,
			}, alice);
			assert.strictEqual(followersRes.status, 200);
			assert.strictEqual(Array.isArray(followersRes.body), true);
		}
		{
			await api('i/update', {
				followingVisibility: 'private',
				followersVisibility: 'private',
			}, alice);

			const followersRes = await api('users/followers', {
				userId: alice.id,
			}, alice);
			assert.strictEqual(followersRes.status, 200);
			assert.strictEqual(Array.isArray(followersRes.body), true);
		}
	});

	test('followingVisibility, followersVisibility がともに private なユーザーのフォロー/フォロワーを他人が見れない', async () => {
		await api('i/update', {
			followingVisibility: 'private',
			followersVisibility: 'private',
		}, alice);

		await assertFollowingForbidden(bob);
		await assertFollowersForbidden(bob);
	});

	test('followingVisibility が private なユーザーのフォローを followersVisibility の設定に関わらず他人が見れない', async () => {
		{
			await api('i/update', {
				followingVisibility: 'private',
				followersVisibility: 'public',
			}, alice);

			await assertFollowingForbidden(bob);
		}
		{
			await api('i/update', {
				followingVisibility: 'private',
				followersVisibility: 'followers',
			}, alice);

			await assertFollowingForbidden(bob);
		}
		{
			await api('i/update', {
				followingVisibility: 'private',
				followersVisibility: 'private',
			}, alice);

			await assertFollowingForbidden(bob);
		}
	});

	test('followersVisibility が private なユーザーのフォロワーを followingVisibility の設定に関わらず他人が見れない', async () => {
		{
			await api('i/update', {
				followingVisibility: 'public',
				followersVisibility: 'private',
			}, alice);

			await assertFollowersForbidden(bob);
		}
		{
			await api('i/update', {
				followingVisibility: 'followers',
				followersVisibility: 'private',
			}, alice);

			await assertFollowersForbidden(bob);
		}
		{
			await api('i/update', {
				followingVisibility: 'private',
				followersVisibility: 'private',
			}, alice);

			await assertFollowersForbidden(bob);
		}
	});

	describe('AP', () => {
		test('followingVisibility が public 以外ならばAPからはフォローを取得できない', async () => {
			{
				await api('i/update', {
					followingVisibility: 'public',
				}, alice);

				const followingRes = await simpleGet(`/users/${alice.id}/following`, 'application/activity+json');
				assert.strictEqual(followingRes.status, 200);
			}
			{
				await api('i/update', {
					followingVisibility: 'followers',
				}, alice);

				const followingRes = await simpleGet(`/users/${alice.id}/following`, 'application/activity+json');
				assert.strictEqual(followingRes.status, 403);
			}
			{
				await api('i/update', {
					followingVisibility: 'private',
				}, alice);

				const followingRes = await simpleGet(`/users/${alice.id}/following`, 'application/activity+json');
				assert.strictEqual(followingRes.status, 403);
			}
		});

		test('followersVisibility が public 以外ならばAPからはフォロワーを取得できない', async () => {
			{
				await api('i/update', {
					followersVisibility: 'public',
				}, alice);

				const followersRes = await simpleGet(`/users/${alice.id}/followers`, 'application/activity+json');
				assert.strictEqual(followersRes.status, 200);
			}
			{
				await api('i/update', {
					followersVisibility: 'followers',
				}, alice);

				const followersRes = await simpleGet(`/users/${alice.id}/followers`, 'application/activity+json');
				assert.strictEqual(followersRes.status, 403);
			}
			{
				await api('i/update', {
					followersVisibility: 'private',
				}, alice);

				const followersRes = await simpleGet(`/users/${alice.id}/followers`, 'application/activity+json');
				assert.strictEqual(followersRes.status, 403);
			}
		});
	});
});
