/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import * as Misskey from 'misskey-js';
import { prepareNotesForDigest } from '@/utility/tempura-script/tl-digest/core.js';
import {
	clearTlDigestMetrics,
	getTlDigestMetrics,
	measureTlDigestSync,
} from '@/utility/tempura-script/tl-digest/metrics.js';

/**
 * TL ダイジェストのフィルタ処理スループットを計測するベンチマーク。
 *
 * 目的は「速いこと」の証明ではなく、**退行の検出**。
 * 閾値は CI ランナーの速度差を吸収できるよう、実測に対して十分な余裕を持たせている。
 * 計測値をそのまま表明すると環境依存でフレークするため、
 * 件数に対して線形に近い時間で収まること (= 実装が二次関数的に劣化していないこと)
 * を主眼に置く。
 */

function makeNote(index: number, userId: string): Misskey.entities.Note {
	return {
		id: `bench-${index}`,
		createdAt: new Date(Date.UTC(2026, 10, 24, 12, 0, 0) - index * 1000).toISOString(),
		userId,
		user: {
			id: userId,
			name: `User ${userId}`,
			username: `user_${userId}`,
			host: null,
			avatarUrl: '',
			avatarBlurhash: null,
			avatarDecorations: [],
			isBot: false,
			isCat: false,
			emojis: {},
			onlineStatus: 'online',
			badgeRoles: [],
		} as unknown as Misskey.entities.UserLite,
		text: `ベンチマーク用の投稿本文 ${index} ラーメンの話やGPUの話など ${'あ'.repeat(120)}`,
		cw: null,
		visibility: 'public',
		localOnly: false,
		reactionAcceptance: null,
		renoteCount: 0,
		repliesCount: 0,
		reactionCount: 0,
		reactions: {},
		reactionEmojis: {},
		fileIds: [],
		files: [],
		replyId: null,
		renoteId: null,
		dontShowOnLtl: false,
	} as Misskey.entities.Note;
}

function buildNotes(count: number, userCount = 40): Misskey.entities.Note[] {
	return Array.from({ length: count }, (_, i) => makeNote(i, `u-${i % userCount}`));
}

/** ミュート語を大量に持つユーザーを想定した語彙セット */
const HEAVY_MUTE_WORDS: Array<string | string[]> = [
	...Array.from({ length: 50 }, (_, i) => `muted_term_${i}`),
	...Array.from({ length: 20 }, (_, i) => [`compound_${i}`, `term_${i}`] as string[]),
	'/spam-\\d+/i',
];

describe('TL digest フィルタのベンチマーク', () => {
	it('500 件のノートを重いミュート語彙でも線形時間で処理できる', () => {
		const notes = buildNotes(500);

		// ウォームアップ (JIT・キャッシュの初回コストを除外)
		prepareNotesForDigest(notes.slice(0, 50), { mutedWords: HEAVY_MUTE_WORDS });

		const start = performance.now();
		const result = prepareNotesForDigest(notes, { mutedWords: HEAVY_MUTE_WORDS });
		const elapsed = performance.now() - start;

		expect(result.prepared.length).toBeGreaterThan(0);
		// 500 件で 5 秒を超えるのは明らかな退行 (実測は数十 ms 台)
		expect(elapsed).toBeLessThan(5000);
	});

	it('件数が増えても処理時間が二次関数的に増えない', () => {
		const small = buildNotes(100);
		const large = buildNotes(800);

		prepareNotesForDigest(small, { mutedWords: HEAVY_MUTE_WORDS });
		prepareNotesForDigest(large, { mutedWords: HEAVY_MUTE_WORDS });

		const t1 = performance.now();
		prepareNotesForDigest(small, { mutedWords: HEAVY_MUTE_WORDS });
		const smallMs = performance.now() - t1;

		const t2 = performance.now();
		prepareNotesForDigest(large, { mutedWords: HEAVY_MUTE_WORDS });
		const largeMs = performance.now() - t2;

		// 件数は 8 倍。二次関数的なら 64 倍近くになる。
		// 実測のブレを吸収しつつ退行を捕まえるため、24 倍を上限とする。
		const ratio = largeMs / Math.max(smallMs, 0.5);
		expect(ratio).toBeLessThan(24);
	});

	it('ユーザーフィルタを有効にしても処理量が大きく増えない', () => {
		const notes = buildNotes(500);
		const blockIds = Array.from({ length: 20 }, (_, i) => `u-${i}`);

		const t1 = performance.now();
		prepareNotesForDigest(notes, { mutedWords: HEAVY_MUTE_WORDS });
		const withoutFilter = performance.now() - t1;

		const t2 = performance.now();
		prepareNotesForDigest(notes, {
			mutedWords: HEAVY_MUTE_WORDS,
			userFilterMode: 'block',
			userFilterUserIds: blockIds,
		});
		const withFilter = performance.now() - t2;

		expect(withFilter).toBeLessThan(Math.max(withoutFilter * 3, 200));
	});
});

describe('metrics ヘルパ', () => {
	it('同期計測は結果と所要時間を返し、メトリクスに記録される', () => {
		clearTlDigestMetrics();
		const { value, durationMs } = measureTlDigestSync('filter', () => 42, 10);

		expect(value).toBe(42);
		expect(durationMs).toBeGreaterThanOrEqual(0);

		const recorded = getTlDigestMetrics();
		expect(recorded).toHaveLength(1);
		expect(recorded[0].phase).toBe('filter');
		expect(recorded[0].size).toBe(10);
	});

	it('保持件数は上限を超えない', () => {
		clearTlDigestMetrics();
		for (let i = 0; i < 80; i++) {
			measureTlDigestSync('scan', () => i);
		}
		expect(getTlDigestMetrics().length).toBeLessThanOrEqual(50);
	});
});
