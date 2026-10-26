/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { SubAccountService } from '@/core/SubAccountService.js';

function setup() {
	const users: Record<string, { id: string; parentUserId: string | null; token: string }> = {
		main: { id: 'main', parentUserId: null, token: 'main_token_00000' },
		subA: { id: 'subA', parentUserId: 'main', token: 'suba_token_00000' },
		subB: { id: 'subB', parentUserId: 'main', token: 'subb_token_00000' },
		other: { id: 'other', parentUserId: null, token: 'other_token_0000' },
		otherSub: { id: 'otherSub', parentUserId: 'other', token: 'othersub_token_0' },
	};
	const accessTokens: { id: string; userId: string }[] = [
		{ id: 't1', userId: 'main' }, { id: 't2', userId: 'subA' }, { id: 't3', userId: 'subB' }, { id: 't4', userId: 'otherSub' },
	];
	const usersRepository = {
		findBy: async (w: any) => Object.values(users).filter(u => u.parentUserId === w.parentUserId).map(u => ({ ...u })),
		update: async (id: string, patch: any) => { Object.assign(users[id], patch); },
	};
	const accessTokensRepository = {
		delete: async (w: any) => { for (let i = accessTokens.length - 1; i >= 0; i--) if (accessTokens[i].userId === w.userId) accessTokens.splice(i, 1); },
	};
	const events = { publishInternalEvent: vi.fn(), publishMainStream: vi.fn() };
	const none = undefined as never;
	const service = new SubAccountService(usersRepository as never, accessTokensRepository as never, none, none, none, none, none, none, none, events as never, none, none);
	return { service, users, accessTokens, events };
}

describe('SubAccountService.invalidateSubAccountTokens', () => {
	test('regenerates sub tokens, deletes their API keys and disconnects them; others untouched', async () => {
		const { service, users, accessTokens, events } = setup();
		const before = JSON.parse(JSON.stringify(users));
		const ids = await service.invalidateSubAccountTokens('main');
		expect(ids.sort()).toEqual(['subA', 'subB']);
		expect(users.subA.token).not.toBe(before.subA.token);
		expect(users.subB.token).not.toBe(before.subB.token);
		expect(users.main.token).toBe('main_token_00000');
		expect(users.otherSub.token).toBe('othersub_token_0');
		expect(accessTokens.map(t => t.id).sort()).toEqual(['t1', 't4']);
		const revoked = events.publishInternalEvent.mock.calls.filter(c => c[0] === 'subAccountSessionsRevoked').flatMap(c => c[1].subIds).sort();
		expect(revoked).toEqual(['subA', 'subB']);
		const regenerated = events.publishInternalEvent.mock.calls.filter(c => c[0] === 'userTokenRegenerated').map(c => c[1].oldToken).sort();
		expect(regenerated).toEqual(['suba_token_00000', 'subb_token_00000']);
	});

	test('a main account without sub-accounts is a no-op', async () => {
		const { service, events } = setup();
		expect(await service.invalidateSubAccountTokens('other2')).toEqual([]);
		expect(events.publishInternalEvent).not.toHaveBeenCalled();
	});

	test('regenerating one sub token leaves siblings alone', async () => {
		const { service, users, accessTokens } = setup();
		await service.regenerateToken(users.subA);
		expect(users.subA.token).not.toBe('suba_token_00000');
		expect(users.subB.token).toBe('subb_token_00000');
		expect(accessTokens.map(t => t.id).sort()).toEqual(['t1', 't3', 't4']);
	});
});
