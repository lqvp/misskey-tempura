/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi } from 'vitest';
import { SearchService } from '@/core/SearchService.js';
import FeaturedEndpoint from '@/server/api/endpoints/notes/featured.js';
import { FeedService } from '@/server/web/FeedService.js';
import { RoleTimelineChannel } from '@/server/api/stream/channels/role-timeline.js';

const makeService = (type: any, fields: Record<string, unknown>): any => Object.assign(Object.create(type.prototype), fields);

describe('visitor visibility before limits', () => {
	test.each(['local', 'all', 'none'])('Meilisearch applies visitor visibility %s before limiting', async visibility => {
		const search = vi.fn().mockResolvedValue({ hits: [] });
		const service = makeService(SearchService, { meilisearch: {}, meilisearchNoteIndex: { search }, meta: { ugcVisibilityForVisitor: visibility } });
		await service.searchNoteByMeilisearch('test', null, {}, { limit: 2 });
		if (visibility === 'none') {
			expect(search).not.toHaveBeenCalled();
		} else {
			expect(search.mock.calls[0][1].limit).toBe(2);
			expect(search.mock.calls[0][1].filter.includes('userHost IS NULL')).toBe(visibility === 'local');
		}
	});

	test('featured fills the limit with local notes when remote notes rank first', async () => {
		const rows = [{ id: '4', userHost: 'remote' }, { id: '3', userHost: 'remote' }, { id: '2', userHost: null }, { id: '1', userHost: null }];
		let ids: string[] = [];
		let local = false;
		const query: any = {
			where: (_: string, params: any) => { ids = params.noteIds; return query; },
			innerJoinAndSelect: () => query, leftJoinAndSelect: () => query,
			getMany: async () => rows.filter(n => ids.includes(n.id) && (!local || n.userHost == null)),
		};
		const endpoint = new FeaturedEndpoint({ entranceShowFeatured: true } as any, { createQueryBuilder: () => query } as any, {} as any,
			{ packMany: async (notes: any) => notes } as any, { getGlobalNotesRanking: async () => rows.map(n => n.id) } as any,
			{ generateBlockedHostQueryForNote: () => {}, generateSuspendedUserQueryForNote: () => {}, generateUgcVisibilityQueryForVisitor: () => { local = true; } } as any);
		expect(await endpoint.exec({ limit: 2 }, null, null)).toEqual(rows.slice(2));
	});

	test.each(['public', 'home'])('feeds hide old %s notes demoted to followers-only', async visibility => {
		const service = makeService(FeedService, {
			config: { url: 'https://local.example', host: 'local.example' },
			userProfilesRepository: { findOneByOrFail: async () => ({ followingVisibility: 'public', followersVisibility: 'public' }) },
			notesRepository: { find: async () => [
				{ id: 'old', visibility, fileIds: [] }, { id: 'new', visibility, fileIds: [] },
			] },
			userEntityService: { getIdenticonUrl: () => undefined },
			idService: { parse: (id: string) => ({ date: new Date(id === 'old' ? 1000 : 10000) }) },
		});
		const feed = await service.packFeed({ id: 'user', username: 'user', makeNotesFollowersOnlyBefore: 5 });
		expect(feed.items.map((item: any) => item.link)).toEqual(['https://local.example/notes/new']);
	});

	test('an existing role subscription stops delivering after the role becomes private', async () => {
		let isPublic = true;
		const send = vi.fn();
		const service = makeService(RoleTimelineChannel, {
			roleId: 'role', rolesRepository: { findOneBy: async () => isPublic ? { isPublic: true } : null },
			roleservice: { isExplorable: async () => true }, connection: { user: null },
			isNoteMutedOrBlocked: () => false, noteStreamingHidingService: { filter: async (note: any) => note },
		});
		Object.defineProperty(service, 'send', { value: send });
		const event = { type: 'note', body: { visibility: 'public', user: {} } };
		await service.onEvent(event);
		expect(send).toHaveBeenCalledTimes(1);
		isPublic = false;
		await service.onEvent(event);
		expect(send).toHaveBeenCalledTimes(1);
	});
});
