/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect, vi } from 'vitest';
import { AntennaChannel } from '../../src/server/api/stream/channels/antenna.js';

// note -> noteMatched が同一ティックで連続配送されても、note の非同期フィルタ完了まで
// noteMatched を保留し、note が実際に送信された場合だけ対応付けて送信することを検証する。
// Node の EventEmitter は async listener を await しないため、直列化がなければ
// noteMatched が先に処理されて破棄される(実際に発生していた退行)。

type SentEvent = { type: string; body: any };

function createChannel(opts: {
	filter: (note: any) => Promise<any>;
}) {
	const sent: SentEvent[] = [];
	const connection = {
		user: { id: 'me' },
		userProfile: {},
		following: {},
		userIdsWhoMeMuting: new Set<string>(),
		userIdsWhoMeMutingRenotes: new Set<string>(),
		userIdsWhoBlockingMe: new Set<string>(),
		userMutedInstances: new Set<string>(),
		mutingChannels: new Set<string>(),
		sendMessageToWs: (_kind: string, payload: { id: string; type: string; body: any }) => {
			sent.push({ type: payload.type, body: payload.body });
		},
	};
	const channel = new AntennaChannel(
		{ id: 'ch1', connection: connection as any },
		{} as any, // antennasRepository (initでは使わない)
		{ withMyRenoteReaction: vi.fn(async (note: any) => note) } as any,
		{ filter: opts.filter } as any,
	);
	return { channel, sent };
}

const note = {
	id: 'note1',
	userId: 'author1',
	user: { id: 'author1', host: null },
	text: 'キーワードを含むノート',
	visibility: 'public',
	channelId: null,
};

const matchPayload = { noteId: 'note1', matchedKeywords: [['キーワード']], matchedExcludeKeywords: [] };

async function drain() {
	// キュー処理の完了を待つ
	for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
}

describe('AntennaChannel', () => {
	it('note -> noteMatched が連続して届いても、note送信後にnoteMatchedを送信する', async () => {
		let resolveFilter: (note: any) => void;
		const { channel, sent } = createChannel({
			filter: () => new Promise(resolve => { resolveFilter = resolve; }),
		});

		// EventEmitterからの配送を模倣: onEventを同期的に連続呼出しする
		(channel as any).onEvent({ type: 'note', body: note });
		(channel as any).onEvent({ type: 'noteMatched', body: matchPayload });
		// キュー経由でhandleEventがfilterを呼ぶまで待ってから解決する
		await new Promise(resolve => setImmediate(resolve));
		resolveFilter!(note);
		await drain();

		expect(sent.map(x => x.type)).toEqual(['note', 'noteMatched']);
		expect(sent[1].body).toEqual(matchPayload);
	});

	it('noteがフィルタで除外された場合、noteMatchedは送信しない(漏洩防止)', async () => {
		const { channel, sent } = createChannel({ filter: async () => null });

		(channel as any).onEvent({ type: 'note', body: note });
		(channel as any).onEvent({ type: 'noteMatched', body: matchPayload });
		await drain();

		expect(sent).toEqual([]);
	});

	it('noteの処理に失敗しても後続イベントの配信が止まらず、対応しないnoteMatchedは送信しない', async () => {
		const { channel, sent } = createChannel({
			filter: async (n: any) => {
				if (n.id === 'note1') throw new Error('filter failure');
				return n;
			},
		});

		(channel as any).onEvent({ type: 'note', body: note });
		(channel as any).onEvent({ type: 'noteMatched', body: matchPayload });
		const note2 = { ...note, id: 'note2' };
		const match2 = { ...matchPayload, noteId: 'note2' };
		(channel as any).onEvent({ type: 'note', body: note2 });
		(channel as any).onEvent({ type: 'noteMatched', body: match2 });
		await drain();

		expect(sent.map(x => x.type)).toEqual(['note', 'noteMatched']);
		expect(sent[0].body.id).toBe('note2');
		expect(sent[1].body).toEqual(match2);
	});
});
