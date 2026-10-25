/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi, afterEach } from 'vitest';
import { CacheService } from '@/core/CacheService.js';

function createService() {
	const usersRepository = { findOneBy: vi.fn() };
	const messageHandlers: Array<(channel: string, data: string) => unknown> = [];
	const redisForSub = {
		on: vi.fn((event: string, handler: (channel: string, data: string) => unknown) => {
			if (event === 'message') messageHandlers.push(handler);
		}),
		off: vi.fn(),
	};
	const userEntityService = { isLocalUser: (u: any) => u.host == null };

	const service = new CacheService(
		{} as any, // redis
		redisForSub as any,
		usersRepository as any,
		{} as any, // userProfiles
		{} as any, // mutings
		{} as any, // blockings
		{} as any, // renoteMutings
		{} as any, // quoteMutings
		{} as any, // avatarDecorationMutings
		{} as any, // followings
		userEntityService as any,
	);

	const emit = (type: string, body: unknown) => {
		const data = JSON.stringify({ channel: 'internal', message: { type, body } });
		for (const h of messageHandlers) h('', data);
	};

	return { service, usersRepository, emit };
}

const tick = () => new Promise(r => setImmediate(r));

describe('CacheService (user cache events)', () => {
	let service: CacheService;
	afterEach(() => {
		service?.dispose();
	});

	test('a stale read from an older event must not overwrite a newer event\'s invalidation (controlled-delay ordering)', async () => {
		const ctx = createService();
		service = ctx.service;
		const uri = 'https://remote.test/users/u1';
		const staleUser = { id: 'u1', host: 'remote.test', uri, isDeleted: true };

		// 削除処理中に古いイベント(remoteUserUpdated)によってisDeleted行がキャッシュされている状態
		service.uriPersonCache.set(uri, staleUser as any);
		service.userByIdCache.set('u1', staleUser as any);

		// 1回目のfindOneBy(古いイベント側)は遅延させる。2回目(削除後イベント側)は行が無いので即nullを返す。
		let resolveFirst!: (v: any) => void;
		const firstCall = new Promise(r => { resolveFirst = r; });
		ctx.usersRepository.findOneBy
			.mockImplementationOnce(() => firstCall)
			.mockResolvedValueOnce(null);

		// 受信順: 1) remoteUserUpdated (行がまだある時に発行) 2) userChangeDeletedState (物理削除後に発行)
		ctx.emit('remoteUserUpdated', { id: 'u1' });
		ctx.emit('userChangeDeletedState', { id: 'u1', isDeleted: true });

		await tick();
		// 古いイベントのDB読みを、削除後イベントの方が「先に完了しうる」状況で完了させる。
		// 直列化されていなければ、この後に古いイベントのcache SETが実行され、staleな行が残る。
		resolveFirst(staleUser);
		// 両handlerのcontinuationが全て完了するまで待ってから最終状態を検証する
		await tick();
		await tick();

		expect(ctx.usersRepository.findOneBy).toHaveBeenCalledTimes(2);
		expect(service.uriPersonCache.get(uri)).toBeUndefined();
		expect(service.userByIdCache.get('u1')).toBeUndefined();
	});

	test('a user update event updates the caches when the row exists', async () => {
		const ctx = createService();
		service = ctx.service;
		const uri = 'https://remote.test/users/u2';
		const oldUser = { id: 'u2', host: 'remote.test', uri, name: 'old' };
		const newUser = { id: 'u2', host: 'remote.test', uri, name: 'new' };
		service.uriPersonCache.set(uri, oldUser as any);

		ctx.usersRepository.findOneBy.mockResolvedValueOnce(newUser);
		ctx.emit('remoteUserUpdated', { id: 'u2' });

		await vi.waitFor(() => {
			expect(service.userByIdCache.get('u2')?.name).toBe('new');
			expect(service.uriPersonCache.get(uri)?.name).toBe('new');
		});
	});

	test('a failing event invalidates the stale cache instead of leaving it, and the next event still applies', async () => {
		const ctx = createService();
		service = ctx.service;
		const uri = 'https://remote.test/users/u3';
		const staleUser = { id: 'u3', host: 'remote.test', uri, name: 'stale' };
		const user = { id: 'u3', host: 'remote.test', uri, name: 'n' };
		service.userByIdCache.set('u3', staleUser as any);

		ctx.usersRepository.findOneBy
			.mockRejectedValueOnce(new Error('db down')) // 1回目のイベントの適用は失敗
			.mockResolvedValueOnce(user); // 2回目は成功

		ctx.emit('remoteUserUpdated', { id: 'u3' });
		// 失敗時はstaleなキャッシュを残さず安全に無効化する
		await vi.waitFor(() => {
			expect(ctx.usersRepository.findOneBy).toHaveBeenCalledTimes(1);
			expect(service.userByIdCache.get('u3')).toBeUndefined();
		});

		// 失敗してもチェーンは壊れず、次のイベントが適用される
		ctx.emit('remoteUserUpdated', { id: 'u3' });
		await vi.waitFor(() => {
			expect(service.userByIdCache.get('u3')?.name).toBe('n');
		});
	});

	test('a delete event also evicts the native token cache entries for the user', async () => {
		const ctx = createService();
		service = ctx.service;
		const local = { id: 'u7', host: null, token: 'tok7' };
		service.localUserByNativeTokenCache.set('tok7', local as any);
		service.localUserByIdCache.set('u7', local as any);

		ctx.usersRepository.findOneBy.mockResolvedValueOnce(null);
		ctx.emit('userChangeDeletedState', { id: 'u7', isDeleted: true });

		await vi.waitFor(() => {
			expect(service.localUserByNativeTokenCache.get('tok7')).toBeUndefined();
			expect(service.localUserByIdCache.get('u7')).toBeUndefined();
		});
	});

	test('the serialization chain map is cleaned up after the chain drains', async () => {
		const ctx = createService();
		service = ctx.service;
		ctx.usersRepository.findOneBy.mockResolvedValue(null);

		ctx.emit('userChangeDeletedState', { id: 'u9', isDeleted: true });

		await vi.waitFor(() => {
			expect(ctx.usersRepository.findOneBy).toHaveBeenCalledTimes(1);
			expect((service as any).userCacheEventChains.size).toBe(0);
		});
	});

	test('events for different users are not serialized against each other', async () => {
		const ctx = createService();
		service = ctx.service;

		let resolveA!: (v: any) => void;
		const aCall = new Promise(r => { resolveA = r; });
		ctx.usersRepository.findOneBy
			.mockImplementationOnce(() => aCall) // user A: 遅延
			.mockResolvedValueOnce(null); // user B: 即座

		ctx.emit('remoteUserUpdated', { id: 'a' });
		ctx.emit('userChangeDeletedState', { id: 'b', isDeleted: true });

		// AのDB読みが完了していなくてもBのイベントは適用される
		await vi.waitFor(() => {
			expect(ctx.usersRepository.findOneBy).toHaveBeenCalledTimes(2);
		});
		resolveA(null);
		await tick();
	});
});
