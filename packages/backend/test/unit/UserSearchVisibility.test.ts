/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { DataSource } from 'typeorm';
import { UserSearchService } from '@/core/UserSearchService.js';

describe('username search visibility', () => {
	test('only anonymous query builders exclude locked users', () => {
		const db = new DataSource({ type: 'postgres' });
		const service: any = Object.assign(Object.create(UserSearchService.prototype), {
			usersRepository: { createQueryBuilder: () => db.createQueryBuilder().from('user', 'user') },
			followingsRepository: { createQueryBuilder: () => db.createQueryBuilder().from('following', 'following') },
		});
		const authenticated = service.buildSearchUserQueries({ id: 'viewer' }, { username: 'alice' });
		for (const query of authenticated) {
			expect(query.getQuery()).not.toContain('user.isLocked = FALSE');
			expect(query.getQuery()).toContain('user.isSuspended = FALSE');
		}
		for (const query of authenticated.slice(0, 2)) {
			expect(query.getQuery()).toContain('user.id IN (SELECT following.followeeId');
			expect(query.getParameters()).toMatchObject({ followerId: 'viewer' });
		}
		for (const query of service.buildSearchUserNoLoginQueries({ username: 'alice' })) {
			expect(query.getQuery()).toContain('user.isLocked = FALSE');
			expect(query.getQuery()).toContain('user.isSuspended = FALSE');
		}
	});
});
