/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { EntityNotFoundError } from 'typeorm';
import { ChatService } from '@/core/ChatService.js';
import ReactEndpoint from '@/server/api/endpoints/chat/messages/react.js';
import UnreactEndpoint from '@/server/api/endpoints/chat/messages/unreact.js';

for (const [method, Endpoint] of [['react', ReactEndpoint], ['unreact', UnreactEndpoint]] as const) {
	describe(`${method} error boundaries`, () => {
		function setup(message: any = { id: 'message', fromUserId: 'sender', toUserId: 'viewer', toRoomId: null, reactions: [] }) {
			const execute = vi.fn().mockResolvedValue({});
			const query: any = {};
			for (const name of ['update', 'set', 'where', 'setParameter']) query[name] = () => query;
			query.execute = execute;
			const fields = {
				checkChatAvailability: vi.fn(),
				chatMessagesRepository: { findOneBy: vi.fn().mockResolvedValue(message), createQueryBuilder: () => query },
				chatRoomsRepository: { findOneByOrFail: vi.fn().mockResolvedValue({ id: 'room' }) },
				isRoomMember: vi.fn().mockResolvedValue(false),
				userEntityService: { pack: vi.fn() },
				globalEventService: { publishChatUserStream: vi.fn(), publishChatRoomStream: vi.fn() },
			};
			const service = Object.create(ChatService.prototype);
			for (const [key, value] of Object.entries(fields)) Object.defineProperty(service, key, { value });
			const endpoint = new Endpoint(service);
			return { ...fields, execute, run: () => endpoint.exec({ messageId: 'message', reaction: '👍' }, { id: 'viewer' } as any, null) };
		}

		test.each(['missing', 'outsider', 'room', 'fullRoom'])('normalizes %s to NO_SUCH_MESSAGE', async kind => {
			const setupResult = setup(kind === 'missing' ? null : {
				id: 'message', fromUserId: 'sender', toUserId: 'recipient', toRoomId: kind === 'room' || kind === 'fullRoom' ? 'room' : null, reactions: kind === 'fullRoom' ? Array(100).fill('sender/👍') : [],
			});
			await expect(setupResult.run()).rejects.toMatchObject({ code: 'NO_SUCH_MESSAGE' });
			expect(setupResult.execute).not.toHaveBeenCalled();
		});

		test.each(['lookup', 'update', 'packing'])('preserves unrelated %s errors', async stage => {
			const error = stage === 'packing' ? new EntityNotFoundError('User', { id: 'viewer' }) : new Error('database unavailable');
			const setupResult = setup({ id: 'message', fromUserId: 'sender', toUserId: null, toRoomId: 'room', reactions: [] });
			setupResult.isRoomMember.mockResolvedValue(true);
			if (stage === 'lookup') setupResult.chatMessagesRepository.findOneBy.mockRejectedValue(error);
			if (stage === 'update') setupResult.execute.mockRejectedValue(error);
			if (stage === 'packing') setupResult.userEntityService.pack.mockRejectedValue(error);
			await expect(setupResult.run()).rejects.toBe(error);
		});

		test('successful direct message reaction still succeeds', async () => {
			const setupResult = setup();
			await expect(setupResult.run()).resolves.toBeUndefined();
			expect(setupResult.execute).toHaveBeenCalledOnce();
		});
	});
}
