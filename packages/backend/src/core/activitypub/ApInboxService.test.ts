/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { AbortError, FetchError } from 'node-fetch';
import { StatusError } from '@/misc/status-error.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { ApInboxService } from './ApInboxService.js';
import { Resolver } from './ApResolverService.js';
import type { MiRemoteUser } from '@/models/User.js';

function createService() {
	const logger = {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};

	const utilityService = {
		extractDbHost: (uri: string) => new URL(uri).hostname.toLowerCase(),
	};

	const service = new ApInboxService(
		{} as any, // config
		{} as any, // redisClient
		{} as any, // usersRepository
		{} as any, // notesRepository
		{} as any, // followingsRepository
		{} as any, // followRequestsRepository
		{} as any, // userEntityService
		{} as any, // noteEntityService
		utilityService as any,
		{} as any, // idService
		{} as any, // abuseReportService
		{} as any, // userFollowingService
		{} as any, // apAudienceService
		{} as any, // reactionService
		{} as any, // relayService
		{} as any, // notePiningService
		{} as any, // userBlockingService
		{} as any, // noteCreateService
		{} as any, // noteDeleteService
		{} as any, // apResolverService
		{} as any, // apDbResolverService
		{ logger } as any, // apLoggerService
		{} as any, // apNoteService
		{ updatePerson: vi.fn() } as any, // apPersonService
		{} as any, // apQuestionService
		{} as any, // queueService
		{} as any, // globalEventService
	);

	return { service, logger };
}

describe('ApInboxService.performActivity (Collection)', () => {
	const actor = {
		id: 'actor-1',
		uri: 'https://remote.example/users/alice',
		host: 'remote.example',
		isSuspended: false,
		lastFetchedAt: new Date(),
	} as unknown as MiRemoteUser;

	test.each([
		['HTTP 429', new StatusError('429 Too Many Requests', 429, 'Too Many Requests')],
		['HTTP 503', new StatusError('503 Service Unavailable', 503, 'Service Unavailable')],
		['AbortError (timeout)', new AbortError('The operation was aborted.')],
		['FetchError (system network error)', new FetchError('request failed', 'system', { code: 'ECONNRESET' })],
		['FetchError (premature close)', new FetchError('Premature close of server response', undefined as unknown as string)],
	])('一時的な解決失敗 (%s) はジョブのリトライのため再 throw する', async (_label, err) => {
		const { service, logger } = createService();
		const resolver = {
			getRecursionLimit: () => 256,
			resolve: vi.fn().mockRejectedValueOnce(err),
		} as unknown as Resolver;

		const collection = {
			id: 'https://remote.example/collections/1',
			type: 'Collection',
			items: [
				'https://remote.example/activities/1',
				'https://remote.example/activities/2',
			],
		};

		await expect(service.performActivity(actor, collection, resolver)).rejects.toBe(err);
		expect(logger.warn).not.toHaveBeenCalled();
	});

	test('システムアカウント取得の失敗は受信ジョブのリトライに伝播する', async () => {
		const { service, logger } = createService();
		const failure = new Error('database unavailable');
		const signedGet = vi.fn();
		const resolver = new Resolver(
			{} as any, // config
			{ signToActivityPubGet: true } as any, // meta
			{} as any, // usersRepository
			{} as any, // notesRepository
			{} as any, // pollsRepository
			{} as any, // noteReactionsRepository
			{} as any, // followRequestsRepository
			{
				extractDbHost: (uri: string) => new URL(uri).hostname,
				isSelfHost: () => false,
				isFederationAllowedHost: () => true,
			} as any,
			{ fetch: vi.fn().mockRejectedValue(failure) } as any,
			{ signedGet } as any,
			{} as any, // httpRequestService
			{} as any, // apRendererService
			{} as any, // apDbResolverService
			{ getLogger: () => logger } as any,
		);

		await expect(service.performActivity(actor, {
			type: 'Collection',
			items: ['https://remote.example/activities/1'],
		}, resolver)).rejects.toMatchObject({ cause: failure });
		expect(signedGet).not.toHaveBeenCalled();
		expect(logger.warn).not.toHaveBeenCalled();
	});

	test.each([
		['HTTP 404', new StatusError('404 Not Found', 404, 'Not Found')],
		['HTTP 410', new StatusError('410 Gone', 410, 'Gone')],
		['IdentifiableError', new IdentifiableError('72180409-793c-4973-868e-5a118eb5519b', 'invalid response')],
		['FetchError (max-size)', new FetchError('content size over limit', 'max-size')],
		['FetchError (blocked private address)', new FetchError('request failed, reason: Blocked address: 127.0.0.1', 'system')],
		['Validation Error', new Error('Validate content type of AP response: No content-type header')],
	])('恒久的な解決失敗 (%s) はスキップして後続アイテムを処理する', async (_label, err) => {
		const { service, logger } = createService();
		const performOneSpy = vi.spyOn(service, 'performOneActivity').mockResolvedValue('ok');
		const secondAct = {
			id: 'https://remote.example/activities/2',
			type: 'Create',
		};
		const resolver = {
			getRecursionLimit: () => 256,
			resolve: vi.fn()
				.mockRejectedValueOnce(err)
				.mockResolvedValueOnce(secondAct),
		} as unknown as Resolver;

		const collection = {
			id: 'https://remote.example/collections/1',
			type: 'Collection',
			items: [
				'https://remote.example/activities/1',
				'https://remote.example/activities/2',
			],
		};

		await expect(service.performActivity(actor, collection, resolver)).resolves.toBeUndefined();
		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(performOneSpy).toHaveBeenCalledTimes(1);
		expect(performOneSpy).toHaveBeenCalledWith(actor, secondAct, resolver);
	});
});
