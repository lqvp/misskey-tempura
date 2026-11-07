/*
 * SPDX-FileCopyrightText: chan-mai
 * SPDX-License-Identifier: AGPL-3.0-only
*/
import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AntennaService } from '../../src/core/AntennaService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { DI } from '../../src/di-symbols.js';
import { GlobalEventService } from '../../src/core/GlobalEventService.js';
import { UtilityService } from '../../src/core/UtilityService.js';
import { FanoutTimelineService } from '../../src/core/FanoutTimelineService.js';
import { CacheService } from '../../src/core/CacheService.js';

describe('AntennaService', () => {
	let antennaService: AntennaService;

	// Mock dependencies
	const mockRedisForTimelines = { pipeline: vi.fn(() => ({ exec: vi.fn() })) };
	const mockRedisForSub = { on: vi.fn(), off: vi.fn() };
	const mockAntennasRepository = {};
	const mockUserListMembershipsRepository = {};
	const mockCacheService = {
		userFollowingsCache: { fetch: vi.fn() },
		userMutingsCache: { fetch: vi.fn(async () => new Set<string>()) },
		userBlockedCache: { fetch: vi.fn(async () => new Set<string>()) },
	};
	const mockUtilityService = { getFullApAccount: vi.fn() };
	const mockGlobalEventService = { publishAntennaStream: vi.fn() };
	const mockFanoutTimelineService = { push: vi.fn() };

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AntennaService,
				{ provide: DI.redisForTimelines, useValue: mockRedisForTimelines },
				{ provide: DI.redisForSub, useValue: mockRedisForSub },
				{ provide: DI.antennasRepository, useValue: mockAntennasRepository },
				{ provide: DI.userListMembershipsRepository, useValue: mockUserListMembershipsRepository },
				{ provide: LoggerService, useValue: { getLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }) } },
				{ provide: CacheService, useValue: mockCacheService },
				{ provide: UtilityService, useValue: mockUtilityService },
				{ provide: GlobalEventService, useValue: mockGlobalEventService },
				{ provide: FanoutTimelineService, useValue: mockFanoutTimelineService },
			],
		}).compile();

		antennaService = module.get<AntennaService>(AntennaService);
	});

	describe('checkHitAntenna', () => {
		const mockNote = { id: 'note1', text: 'apple orange banana', cw: null, userId: 'u1' } as any;
		const mockUser = { id: 'u1', username: 'user', host: null, isBot: false };

		const baseAntenna = {
			id: 'a1',
			userId: 'me',
			src: 'all',
			users: [],
			keywords: [],
			excludeKeywords: [],
			mustExcludeKeywords: [],
			caseSensitive: false,
			withReplies: false,
			withFile: false,
			excludeBots: false,
			localOnly: false,
			excludeNotesInSensitiveChannel: false,
			expression: null,
			isActive: true,
		} as any;

		// --- Classic Mode Tests ---
		it('Classic: Matches keywords', async () => {
			const antenna = { ...baseAntenna, keywords: [['apple']] };
			const result = await antennaService.checkHitAntenna(antenna, mockNote, mockUser);
			expect(result).toBe(true);
		});

		it('Classic: Excludes keywords', async () => {
			const antenna = { ...baseAntenna, keywords: [['apple']], excludeKeywords: [['banana']] };
			const result = await antennaService.checkHitAntenna(antenna, mockNote, mockUser);
			// In classic mode, excludeKeywords results in miss if matched
			expect(result).toBe(false);
		});

		it('Classic: Must Exclude keywords (Hard Block) -> Ignored in Classic', async () => {
			const antenna = { ...baseAntenna, keywords: [['apple']], mustExcludeKeywords: [['banana']] };
			const result = await antennaService.checkHitAntenna(antenna, mockNote, mockUser);
			expect(result).toBe(true);
		});

		it('Classic: Should NOT exclude text-less note even if excludeKeywords is set (Regression)', async () => {
			const antenna = { ...baseAntenna, excludeKeywords: [['banana']] };
			const note = { ...mockNote, text: null, cw: null };
			const result = await antennaService.checkHitAntenna(antenna, note, mockUser);
			expect(result).toBe(true);
		});

		// --- Scoring Mode Tests ---
		it('Scoring: Hit if Score > 0', async () => {
			const antenna = { ...baseAntenna, expression: 'SCORE', keywords: [['apple']] };
			const result = await antennaService.checkHitAntenna(antenna, mockNote, mockUser);
			// Score = 1
			expect(result).toBe(true);
		});

		it('Scoring: Miss if Score <= 0 (Exclude cancels Match)', async () => {
			const antenna = { ...baseAntenna, expression: 'SCORE', keywords: [['apple']], excludeKeywords: [['banana']] };
			const result = await antennaService.checkHitAntenna(antenna, mockNote, mockUser);
			// Score = 1 (apple) - 1 (banana) = 0
			expect(result).toBe(false);
		});

		it('Scoring: Hit if Score > 0 (2 Matches > 1 Exclude)', async () => {
			const antenna = { ...baseAntenna, expression: 'SCORE', keywords: [['apple'], ['orange']], excludeKeywords: [['banana']] };
			const result = await antennaService.checkHitAntenna(antenna, mockNote, mockUser);
			// Score = 1 (apple) + 1 (orange) - 1 (banana) = 1
			expect(result).toBe(true);
		});

		it('Scoring: Must Exclude overrides Score > 0', async () => {
			const antenna = {
				...baseAntenna,
				expression: 'SCORE',
				keywords: [['apple'], ['orange']], // Score would be 2
				mustExcludeKeywords: [['banana']], // But banana is forbidden
			};
			const result = await antennaService.checkHitAntenna(antenna, mockNote, mockUser);
			expect(result).toBe(false);
		});

		it('Scoring: Empty keywords should NOT exclude (Score=0, but keywords empty)', async () => {
			const antenna = { ...baseAntenna, expression: 'SCORE', keywords: [] };
			const result = await antennaService.checkHitAntenna(antenna, mockNote, mockUser);
			// Score = 0
			// keywords.length = 0 -> Condition (0 > 0 && 0 <= 0) is False -> Returns True
			expect(result).toBe(true);
		});

		it('Classic: Matches keywords in cw field', async () => {
			const antenna = { ...baseAntenna, keywords: [['apple']] };
			const note = { ...mockNote, text: null, cw: 'apple pie' };
			const result = await antennaService.checkHitAntenna(antenna, note, mockUser);
			expect(result).toBe(true);
		});

		it('Classic: Matches keywords across text and cw', async () => {
			const antenna = { ...baseAntenna, keywords: [['apple', 'pie']] }; // AND conjunction
			const note = { ...mockNote, text: 'apple', cw: 'pie recipe' };
			const result = await antennaService.checkHitAntenna(antenna, note, mockUser);
			expect(result).toBe(true);
		});
	});

	describe('findAllMatches', () => {
		it('finds all occurrences of multiple keywords', () => {
			const text = 'apple banana apple orange';
			const keywords = ['apple', 'orange'];
			const result = antennaService.findAllMatches(text, keywords, true);
			expect(result).toHaveLength(3);
			expect(result).toContainEqual({ keyword: 'apple', start: 0, end: 5 });
			expect(result).toContainEqual({ keyword: 'apple', start: 13, end: 18 });
			expect(result).toContainEqual({ keyword: 'orange', start: 19, end: 25 });
		});

		it('is case insensitive by default (when flag false)', () => {
			const text = 'Apple banana APPLE';
			const keywords = ['apple'];
			const result = antennaService.findAllMatches(text, keywords, false);
			expect(result).toHaveLength(2);
			expect(result[0].keyword).toBe('apple');
			expect(result[1].keyword).toBe('apple');
		});

		it('respects case sensitivity', () => {
			const text = 'Apple banana APPLE';
			const keywords = ['apple'];
			const result = antennaService.findAllMatches(text, keywords, true);
			expect(result).toHaveLength(0);
		});

		it('handles multi-byte characters correctly', () => {
			const text = 'こんにちは世界こんにちは';
			const keywords = ['こんにちは'];
			const result = antennaService.findAllMatches(text, keywords, false);
			expect(result).toHaveLength(2);
			expect(result[0].start).toBe(0);
			expect(result[0].end).toBe(5);
			expect(result[1].start).toBe(7);
			expect(result[1].end).toBe(12);
		});

		it('handles unicode length differences in case-insensitive search (e.g. İ -> i̇)', () => {
			// U+0130 (İ) has length 1, but toLowerCase() returns 'i̇' (length 2)
			// Text: 'İA' (length 2)
			// Lower: 'i̇a' (length 3) -> 'a' is at index 2
			// Original match for 'A' should be at index 1
			const text = '\u0130A';
			const keywords = ['a'];
			const result = antennaService.findAllMatches(text, keywords, false);
			expect(result).toHaveLength(1);
			expect(result[0].keyword).toBe('a');
			expect(result[0].start).toBe(1);
			expect(result[0].end).toBe(2);
		});
	});

	describe('deduplicateOverlappingMatches', () => {
		it('keeps non-overlapping matches', () => {
			const matches: any[] = [
				{ keyword: 'A', start: 0, end: 1 },
				{ keyword: 'B', start: 2, end: 3 },
			];
			const result = antennaService.deduplicateOverlappingMatches(matches);
			expect(result).toHaveLength(2);
		});

		it('keeps overlapping matches of different keywords (per-keyword deduplication)', () => {
			// fork仕様: キーワード単位でのみ重複排除するため、別キーワードの重なりは保持される
			const matches: any[] = [
				{ keyword: 'A', start: 0, end: 1 },
				{ keyword: 'ABC', start: 0, end: 3 },
			];
			const result = antennaService.deduplicateOverlappingMatches(matches);
			expect(result).toHaveLength(2);
		});

		it('keeps both matches when one extends further (no cross-keyword replacement)', () => {
			const matches: any[] = [
				// A: [0, 3)
				{ keyword: 'ABC', start: 0, end: 3 },
				// B: [2, 4) - Overlaps with A at 2, but ends later (4 > 3)
				{ keyword: 'BC', start: 2, end: 4 },
			];
			// キーワード単位dedupのため両方残る
			const result = antennaService.deduplicateOverlappingMatches(matches);
			expect(result).toHaveLength(2);
		});

		it('keeps nested matches of different keywords', () => {
			const matches: any[] = [
				// A: [0, 5)
				{ keyword: 'ABCDE', start: 0, end: 5 },
				// B: [1, 4) "BCD" inside A
				{ keyword: 'BCD', start: 1, end: 4 },
			];
			const result = antennaService.deduplicateOverlappingMatches(matches);
			expect(result).toHaveLength(2);
		});

		it('keeps adjacent matches', () => {
			const matches: any[] = [
				{ keyword: 'A', start: 0, end: 1 },
				{ keyword: 'B', start: 1, end: 2 },
			];
			const result = antennaService.deduplicateOverlappingMatches(matches);
			expect(result).toHaveLength(2);
		});
	});

	describe('checkHitAntenna Integration', () => {
		const mockNote = { id: 'note1', text: 'ABC', cw: null, userId: 'u1' } as any;
		const mockUser = { id: 'u1', username: 'user', host: null, isBot: false };
		const baseAntenna = {
			id: 'a1',
			userId: 'me',
			src: 'all',
			users: [],
			keywords: [],
			excludeKeywords: [],
			mustExcludeKeywords: [],
			caseSensitive: false,
			withReplies: false,
			withFile: false,
			excludeBots: false,
			localOnly: false,
			excludeNotesInSensitiveChannel: false,
			expression: 'SCORE',
			isActive: true,
		} as any;

		it('overlaps: "ABC" (Include) vs "BC" (Exclude) -> Miss (Score 0)', async () => {
			// Include: ABC, Exclude: BC
			// Text: ABC
			// Match ABC: [0, 3)
			// Match BC: [1, 3)
			// Per-Group Deduplication:
			//   Include Group: Keep "ABC"
			//   Exclude Group: Keep "BC" (no overlap within this group)
			// Score: Includes(+1) - Excludes(1) = 0 -> Miss
			const antenna = {
				...baseAntenna,
				keywords: [['ABC']],
				excludeKeywords: [['BC']],
			};
			const result = await antennaService.checkHitAntenna(antenna, mockNote, mockUser);
			expect(result).toBe(false);
		});

		it('OR intersection: Group A="ABC" vs Group B="BC" -> Match Both (Score 2)', async () => {
			// Keywords: [['ABC'], ['BC']] (OR logic)
			// Text: ABC
			// Match ABC: [0, 3)
			// Match BC: [1, 3)
			// Per-Group Deduplication:
			//   Group A: Keep "ABC"
			//   Group B: Keep "BC"
			// Score: 1 + 1 = 2 -> Hit
			const antenna = {
				...baseAntenna,
				keywords: [['ABC'], ['BC']],
			};
			const result = await antennaService.checkHitAntenna(antenna, mockNote, mockUser);
			expect(result).toBe(true);
		});

		it('AND intersection: "ABC" AND "BC" -> Hit (per-keyword dedup keeps both)', async () => {
			// Keywords: [['ABC', 'BC']] (AND logic)
			// Text: ABC
			// Match ABC: [0, 3)
			// Match BC: [1, 3)
			// Per-Keyword Deduplication (fork仕様):
			// キーワード単位でのみ重複排除するため、ABC・BCはどちらも有効。
			// Group 0 の全キーワードが見つかる → ヒット
			const antenna = {
				...baseAntenna,
				keywords: [['ABC', 'BC']],
			};
			const result = await antennaService.checkHitAntenna(antenna, mockNote, mockUser);
			expect(result).toBe(true);
		});

		it('Separate occurrences work', async () => {
			// Keywords: [['ABC', 'BC']]
			// Text: ABC BC
			// Match ABC at 0. Match BC at 4. No overlap. both valid.
			// Score: 1 + 1 = 2 -> Hit
			const antenna = {
				...baseAntenna,
				keywords: [['ABC', 'BC']],
			};
			const noteWithTwo = { ...mockNote, text: 'ABC BC' };
			const result = await antennaService.checkHitAntenna(antenna, noteWithTwo, mockUser);
			expect(result).toBe(true);
		});

		it('Nested Exclude: "ABC" (Include) vs "B" (Exclude) -> Miss (Score 0)', async () => {
			// Text: ABC
			// Match ABC (Include) [0, 3) -> Kept
			// Match B (Exclude) [1, 2) -> Kept (Different group)
			// Score: 1 - 1 = 0 -> Miss
			const antenna = {
				...baseAntenna,
				keywords: [['ABC']],
				excludeKeywords: [['B']],
			};
			const result = await antennaService.checkHitAntenna(antenna, mockNote, mockUser);
			expect(result).toBe(false);
		});

		it('Exclude wins if longer: "B" (Include) vs "ABC" (Exclude) -> Miss', async () => {
			// Text: ABC
			// Match B (Include) [1, 2)
			// Match ABC (Exclude) [0, 3)
			// Dedupe: Per Group
			// Include Group: Keep B
			// Exclude Group: Keep ABC
			// Score: 1 - 1 = 0 -> Miss
			const antenna = {
				...baseAntenna,
				keywords: [['B']],
				excludeKeywords: [['ABC']],
			};
			const result = await antennaService.checkHitAntenna(antenna, mockNote, mockUser);
			expect(result).toBe(false);
		});
	});

	describe('受信時のミュート/被ブロック除外', () => {
		const baseAntenna = {
			id: 'a1',
			userId: 'me',
			src: 'all',
			users: [],
			keywords: [['apple']],
			excludeKeywords: [],
			mustExcludeKeywords: [],
			caseSensitive: false,
			withReplies: false,
			withFile: false,
			excludeBots: false,
			localOnly: false,
			excludeNotesInSensitiveChannel: false,
			expression: null,
			isActive: true,
		} as any;
		const mockUser = { id: 'u1', username: 'user', host: null, isBot: false };

		beforeEach(() => {
			mockCacheService.userMutingsCache.fetch.mockResolvedValue(new Set<string>());
			mockCacheService.userBlockedCache.fetch.mockResolvedValue(new Set<string>());
		});

		it('ミュートしているユーザーのノートを除外する', async () => {
			mockCacheService.userMutingsCache.fetch.mockResolvedValue(new Set(['u1']));
			const note = { id: 'note1', text: 'apple', cw: null, userId: 'u1' } as any;
			const result = await antennaService.checkHitAntenna({ ...baseAntenna }, note, mockUser);
			expect(result).toBe(false);
		});

		it('自分をブロックしているユーザーのノートを除外する', async () => {
			mockCacheService.userBlockedCache.fetch.mockResolvedValue(new Set(['u1']));
			const note = { id: 'note1', text: 'apple', cw: null, userId: 'u1' } as any;
			const result = await antennaService.checkHitAntenna({ ...baseAntenna }, note, mockUser);
			expect(result).toBe(false);
		});

		it('返信先の作者をミュートしているノートを除外する', async () => {
			mockCacheService.userMutingsCache.fetch.mockResolvedValue(new Set(['u2']));
			const note = { id: 'note1', text: 'apple', cw: null, userId: 'u1', replyId: 'r1', replyUserId: 'u2' } as any;
			const result = await antennaService.checkHitAntenna({ ...baseAntenna, withReplies: true }, note, mockUser);
			expect(result).toBe(false);
		});

		it('リノート元の作者にブロックされているノートを除外する', async () => {
			mockCacheService.userBlockedCache.fetch.mockResolvedValue(new Set(['u3']));
			const note = { id: 'note1', text: 'apple', cw: null, userId: 'u1', renoteId: 'rn1', renoteUserId: 'u3' } as any;
			const result = await antennaService.checkHitAntenna({ ...baseAntenna }, note, mockUser);
			expect(result).toBe(false);
		});

		it('ミュートもブロックもされていなければ従来どおりヒットする', async () => {
			const note = { id: 'note1', text: 'apple', cw: null, userId: 'u1' } as any;
			const result = await antennaService.checkHitAntenna({ ...baseAntenna }, note, mockUser);
			expect(result).toBe(true);
		});

		it('自分自身のノートは除外しない', async () => {
			// 万が一キャッシュに自分が含まれていても自分のノートは対象外にしない
			mockCacheService.userMutingsCache.fetch.mockResolvedValue(new Set(['me']));
			const note = { id: 'note1', text: 'apple', cw: null, userId: 'me' } as any;
			const result = await antennaService.checkHitAntenna({ ...baseAntenna }, note, { ...mockUser, id: 'me' });
			expect(result).toBe(true);
		});
	});

	describe('getAntennaMatchInfo', () => {
		const baseAntenna = {
			id: 'a1',
			userId: 'me',
			src: 'all',
			users: [],
			keywords: [['apple', 'orange'], ['banana']],
			excludeKeywords: [],
			mustExcludeKeywords: [],
			caseSensitive: false,
			withReplies: false,
			withFile: false,
			excludeBots: false,
			localOnly: false,
			excludeNotesInSensitiveChannel: false,
			expression: null,
			isActive: true,
		} as any;

		it('マッチしたグループ(OR行)を返す', () => {
			const note = { id: 'note1', text: 'apple orange', cw: null, userId: 'u1' } as any;
			const info = antennaService.getAntennaMatchInfo({ ...baseAntenna }, note);
			expect(info.matchedKeywords).toEqual([['apple', 'orange']]);
			expect(info.matchedExcludeKeywords).toEqual([]);
		});

		it('複数グループにマッチした場合は両方返す', () => {
			const note = { id: 'note1', text: 'apple orange banana', cw: null, userId: 'u1' } as any;
			const info = antennaService.getAntennaMatchInfo({ ...baseAntenna }, note);
			expect(info.matchedKeywords).toEqual([['apple', 'orange'], ['banana']]);
		});

		it('SCOREモードでは加算/減算されたグループを返す', () => {
			const antenna = { ...baseAntenna, expression: 'SCORE', keywords: [['apple'], ['orange']], excludeKeywords: [['banana']] };
			const note = { id: 'note1', text: 'apple orange banana', cw: null, userId: 'u1' } as any;
			const info = antennaService.getAntennaMatchInfo(antenna, note);
			expect(info.matchedKeywords).toEqual([['apple'], ['orange']]);
			expect(info.matchedExcludeKeywords).toEqual([['banana']]);
		});

		it('SCOREモードでスコアが0以下(ヒットしない)場合は空を返す', () => {
			const antenna = { ...baseAntenna, expression: 'SCORE', keywords: [['apple']], excludeKeywords: [['banana']] };
			const note = { id: 'note1', text: 'apple banana', cw: null, userId: 'u1' } as any;
			const info = antennaService.getAntennaMatchInfo(antenna, note);
			expect(info.matchedKeywords).toEqual([]);
			expect(info.matchedExcludeKeywords).toEqual([]);
		});

		it('マッチしない場合は空を返す', () => {
			const note = { id: 'note1', text: 'grape', cw: null, userId: 'u1' } as any;
			const info = antennaService.getAntennaMatchInfo({ ...baseAntenna }, note);
			expect(info.matchedKeywords).toEqual([]);
		});
	});

	describe('regex keywordMode', () => {
		const mockNote = { id: 'note1', text: 'apple orange banana', cw: null, userId: 'u1' } as any;
		const mockUser = { id: 'u1', username: 'user', host: null, isBot: false };
		const regexAntenna = {
			id: 'a1',
			userId: 'me',
			src: 'all',
			users: [],
			keywords: [],
			excludeKeywords: [],
			mustExcludeKeywords: [],
			caseSensitive: false,
			withReplies: false,
			withFile: false,
			excludeBots: false,
			localOnly: false,
			excludeNotesInSensitiveChannel: false,
			expression: null,
			isActive: true,
			keywordMode: 'regex',
		} as any;

		it('matches a regex pattern as one whole expression', async () => {
			const antenna = { ...regexAntenna, keywords: [['ap+le']] };
			const result = await antennaService.checkHitAntenna(antenna, mockNote, mockUser);
			expect(result).toBe(true);
		});

		it('does not split an item on whitespace or | (item is a single pattern)', async () => {
			// 'apple orange' は1つの式。文字列そのままなら空白を含む連続一致が必要
			const antenna = { ...regexAntenna, keywords: [['apple orange']] };
			expect(await antennaService.checkHitAntenna(antenna, mockNote, mockUser)).toBe(true);

			// 'apple|grape' も1つの式 (alternationとして評価される)
			const alt = { ...regexAntenna, keywords: [['grape|apple']] };
			expect(await antennaService.checkHitAntenna(alt, mockNote, mockUser)).toBe(true);

			// 空白分割されないので、離れた語へのAND的な解釈にはならない
			const noSplit = { ...regexAntenna, keywords: [['apple banana']] };
			expect(await antennaService.checkHitAntenna(noSplit, mockNote, mockUser)).toBe(false);
		});

		it('applies regex to exclude keywords (same mode for include/exclude)', async () => {
			const antenna = { ...regexAntenna, keywords: [['apple']], excludeKeywords: [['b(an)+a']] };
			const result = await antennaService.checkHitAntenna(antenna, mockNote, mockUser);
			expect(result).toBe(false);
		});

		it('honours case sensitivity in regex mode', async () => {
			const note = { ...mockNote, text: 'Apple' };
			const insensitive = { ...regexAntenna, keywords: [['apple']], caseSensitive: false };
			expect(await antennaService.checkHitAntenna(insensitive, note, mockUser)).toBe(true);
			const sensitive = { ...regexAntenna, keywords: [['apple']], caseSensitive: true };
			expect(await antennaService.checkHitAntenna(sensitive, note, mockUser)).toBe(false);
		});

		it('treats an invalid pattern as no-match instead of throwing', async () => {
			// APIでは弾かれるが、キャッシュ済みエンティティ等に残った場合でも受信全体を止めない
			const antenna = { ...regexAntenna, keywords: [['(unclosed']] };
			const result = await antennaService.checkHitAntenna(antenna, mockNote, mockUser);
			expect(result).toBe(false);
		});

		it('matches an empty-matching pattern (e.g. ^$) against an empty note text in SCORE mode too', async () => {
			// 本文・CWともに空のノートでも、空文字列にマッチする式は通常評価と同じくSCOREでもマッチする
			const emptyNote = { ...mockNote, text: '', cw: null };
			const scoreAntenna = { ...regexAntenna, keywords: [['^$']], expression: 'SCORE' };
			expect(await antennaService.checkHitAntenna(scoreAntenna, emptyNote, mockUser)).toBe(true);
			// 通常評価でもマッチする (両経路で一致)
			const normalAntenna = { ...regexAntenna, keywords: [['^$']] };
			expect(await antennaService.checkHitAntenna(normalAntenna, emptyNote, mockUser)).toBe(true);
		});

		it('keeps AND within a group and OR between groups in regex mode', async () => {
			// 同一グループ: 両方の式にマッチする必要がある
			const andAntenna = { ...regexAntenna, keywords: [['app.+', 'ora.+']] };
			expect(await antennaService.checkHitAntenna(andAntenna, mockNote, mockUser)).toBe(true);
			const andMiss = { ...regexAntenna, keywords: [['app.+', 'grape']] };
			expect(await antennaService.checkHitAntenna(andMiss, mockNote, mockUser)).toBe(false);
			// 別グループ: どちらかにマッチすればよい
			const orAntenna = { ...regexAntenna, keywords: [['grape'], ['ora.+']] };
			expect(await antennaService.checkHitAntenna(orAntenna, mockNote, mockUser)).toBe(true);
		});

		it('scores regex groups in SCORE mode and applies mustExclude', async () => {
			const scored = {
				...regexAntenna,
				expression: 'SCORE',
				keywords: [['app.+'], ['ora.+']],
				excludeKeywords: [['ban.+']],
			};
			// +1 +1 -1 = 1 > 0
			expect(await antennaService.checkHitAntenna(scored, mockNote, mockUser)).toBe(true);
			const cancelled = {
				...regexAntenna,
				expression: 'SCORE',
				keywords: [['app.+']],
				excludeKeywords: [['ora.+']],
			};
			// +1 -1 = 0
			expect(await antennaService.checkHitAntenna(cancelled, mockNote, mockUser)).toBe(false);
			const mustExcluded = {
				...regexAntenna,
				expression: 'SCORE',
				keywords: [['app.+']],
				mustExcludeKeywords: [['ban.+']],
			};
			expect(await antennaService.checkHitAntenna(mustExcluded, mockNote, mockUser)).toBe(false);
		});

		it('returns matched pattern groups as match reason', async () => {
			const antenna = { ...regexAntenna, keywords: [['app.+'], ['ora.+']] };
			const info = antennaService.getAntennaMatchInfo(antenna, mockNote);
			expect(info.matchedKeywords).toEqual([['app.+'], ['ora.+']]);
		});

		it('literal mode still treats regex metacharacters as plain text', async () => {
			// 同じ式でもモードで結果が変わることを、literal と regex の両方で対照させる
			const literal = { ...regexAntenna, keywordMode: 'literal', keywords: [['app.+']] };
			const regex = { ...regexAntenna, keywordMode: 'regex', keywords: [['app.+']] };
			const literalNote = { ...mockNote, text: 'this has app.+ literally' };
			expect(await antennaService.checkHitAntenna(literal, literalNote, mockUser)).toBe(true);
			expect(await antennaService.checkHitAntenna(literal, mockNote, mockUser)).toBe(false);
			expect(await antennaService.checkHitAntenna(regex, literalNote, mockUser)).toBe(true);
			expect(await antennaService.checkHitAntenna(regex, mockNote, mockUser)).toBe(true);
		});

		it('firstMatchOnly (SCORE) keeps the same hit result as collecting all matches', async () => {
			// SCORE評価は全マッチを集めずに1件で打ち切るが、グループの成否は変わらないこと
			const note = { ...mockNote, text: 'apple apple orange' };
			const antenna = { ...regexAntenna, expression: 'SCORE', keywords: [['app.+'], ['ora.+']], excludeKeywords: [['ban.+']] };
			const info = antennaService.getAntennaMatchInfo(antenna, note);
			expect(info.matchedKeywords).toEqual([['app.+'], ['ora.+']]);
			expect(info.matchedExcludeKeywords).toEqual([]);
		});

		it('reports exclude keyword groups in SCORE mode with regex', async () => {
			// スコアが正のままなら減点されたグループがマッチ理由として残る
			const antenna = { ...regexAntenna, expression: 'SCORE', keywords: [['app.+'], ['ora.+']], excludeKeywords: [['ban.+']] };
			const info = antennaService.getAntennaMatchInfo(antenna, mockNote);
			expect(info.matchedKeywords).toEqual([['app.+'], ['ora.+']]);
			expect(info.matchedExcludeKeywords).toEqual([['ban.+']]);
		});

		it('does not apply mustExcludeKeywords outside SCORE mode even in regex mode', async () => {
			const antenna = { ...regexAntenna, keywords: [['app.+']], mustExcludeKeywords: [['ban.+']] };
			expect(await antennaService.checkHitAntenna(antenna, mockNote, mockUser)).toBe(true);
		});

		it('matches zero-width patterns against empty text in both modes', async () => {
			const emptyNote = { ...mockNote, text: '', cw: null };
			for (const expression of [null, 'SCORE']) {
				const antenna = { ...regexAntenna, expression, keywords: [['^$']] };
				expect(await antennaService.checkHitAntenna(antenna, emptyNote, mockUser)).toBe(true);
			}
			// literal では空文字列に一致し得ないので、同じ式でもマッチしない
			const literal = { ...regexAntenna, keywordMode: 'literal', keywords: [['^$']] };
			expect(await antennaService.checkHitAntenna(literal, emptyNote, mockUser)).toBe(false);
		});
	});

	describe('findAllMatches (regex mode)', () => {
		it('finds all regex match positions', () => {
			const result = antennaService.findAllMatches('a1 a2 a3', ['a.'], true, 'regex');
			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({ keyword: 'a.', start: 0, end: 2 });
			expect(result[2]).toEqual({ keyword: 'a.', start: 6, end: 8 });
		});

		it('does not loop forever on zero-length matches', () => {
			const result = antennaService.findAllMatches('aa b', ['a*'], true, 'regex');
			expect(result.length).toBeGreaterThan(0);
			expect(result[0]).toEqual({ keyword: 'a*', start: 0, end: 2 });
		});

		it('returns empty for invalid patterns', () => {
			expect(antennaService.findAllMatches('text', ['(bad'], true, 'regex')).toEqual([]);
		});

		it('collects only the first match per pattern when firstMatchOnly is set', () => {
			const all = antennaService.findAllMatches('a1 a2 a3', ['a.'], true, 'regex');
			const first = antennaService.findAllMatches('a1 a2 a3', ['a.'], true, 'regex', true);
			expect(all).toHaveLength(3);
			expect(first).toHaveLength(1);
			expect(first[0]).toEqual({ keyword: 'a.', start: 0, end: 2 });
		});

		it('keeps one match per pattern even when a pattern overlaps itself', () => {
			const result = antennaService.findAllMatches('aaaa', ['aa'], true, 'regex', true);
			expect(result).toHaveLength(1);
		});
	});
});
