/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect } from 'vitest';
import Connection from '@/server/api/stream/Connection.js';

type FakeMsg = { type: string; body: any };

const mkConn = (opts: {
	user?: any;
	ugc?: 'all' | 'local' | 'none';
	authorHost?: string | null;
}) => {
	const sent: FakeMsg[] = [];
	const ws = { send: (raw: string) => { sent.push(JSON.parse(raw)); } };
	const cacheService = {
		findUserById: async (id: string) => ({ id, host: opts.authorHost ?? null }),
		userMutingsCache: { fetch: async () => new Set<string>() },
	};
	const metaService = { fetch: async () => ({ ugcVisibilityForVisitor: opts.ugc ?? 'local' }) };
	const conn: any = new (Connection as any)(null, null, cacheService, null, null, metaService, { user: opts.user ?? null, token: null });
	conn.wsConnection = ws;
	conn.userIdsWhoMeMutingAvatarDecorations = new Set<string>();
	return { conn, sent };
};

const mkData = (type: string, actorId: string, reactorId: string) => ({
	type,
	body: {
		id: actorId + '-note',
		userId: actorId,
		visibility: 'public',
		visibleUserIds: [],
		body: { reaction: '❤', userId: reactorId },
	},
});

describe('Connection noteUpdated anonymous gating', () => {
	test('anonymous + local gate: local-author reacted event delivered with reactor userId masked', async () => {
		const { conn, sent } = mkConn({ ugc: 'local', authorHost: null });
		await conn.onNoteStreamMessage(mkData('reacted', 'local_author', 'reactor1'));
		expect(sent).toHaveLength(1);
		expect(sent[0].type).toBe('noteUpdated');
		expect(sent[0].body.body.userId).toBeNull();
		expect(sent[0].body.id).toBe('local_author-note');
	});

	test('anonymous + local gate: remote-author event suppressed', async () => {
		const { conn, sent } = mkConn({ ugc: 'local', authorHost: 'remote.example' });
		await conn.onNoteStreamMessage(mkData('reacted', 'remote_author', 'reactor1'));
		expect(sent).toHaveLength(0);
	});

	test('anonymous + none gate: all noteUpdated events suppressed', async () => {
		const { conn, sent } = mkConn({ ugc: 'none', authorHost: null });
		await conn.onNoteStreamMessage(mkData('reacted', 'local_author', 'reactor1'));
		await conn.onNoteStreamMessage(mkData('updated', 'local_author', 'reactor1'));
		expect(sent).toHaveLength(0);
	});

	test('anonymous + all: reactor userId still masked (REST notes/reactions anon returns [])', async () => {
		const { conn, sent } = mkConn({ ugc: 'all', authorHost: null });
		await conn.onNoteStreamMessage(mkData('unreacted', 'local_author', 'reactor1'));
		expect(sent).toHaveLength(1);
		expect(sent[0].body.body.userId).toBeNull();
	});

	test('authenticated: reaction event unchanged, reactor userId preserved', async () => {
		const { conn, sent } = mkConn({ user: { id: 'viewer', host: null } as any, ugc: 'none' });
		await conn.onNoteStreamMessage(mkData('reacted', 'some_author', 'reactor1'));
		expect(sent).toHaveLength(1);
		expect(sent[0].body.body.userId).toBe('reactor1');
	});

	test('authenticated follower note passes visibility gate unchanged', async () => {
		const { conn, sent } = mkConn({ user: { id: 'viewer', host: null } as any, ugc: 'none' });
		conn.following = { some_author: { withReplies: false } };
		const data = mkData('reacted', 'some_author', 'reactor1');
		(data.body as any).visibility = 'followers';
		await conn.onNoteStreamMessage(data);
		expect(sent).toHaveLength(1);
		expect(sent[0].body.body.userId).toBe('reactor1');
	});
});
