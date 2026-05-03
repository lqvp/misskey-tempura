/*
 * SPDX-FileCopyrightText: chan-mai
 * SPDX-License-Identifier: AGPL-3.0-only
*/
import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AntennaService } from '../../src/core/AntennaService.js';
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
	const mockCacheService = { userFollowingsCache: { fetch: vi.fn() } };
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

		it('keeps longest match when started at same position', () => {
			const matches: any[] = [
				{ keyword: 'A', start: 0, end: 1 },
				{ keyword: 'ABC', start: 0, end: 3 },
			];
			const result = antennaService.deduplicateOverlappingMatches(matches);
			expect(result).toHaveLength(1);
			expect(result[0].keyword).toBe('ABC');
		});

		it('keeps matches that extend further (replace shorter/earlier-ending overlap)', () => {
			const matches: any[] = [
				// A: [0, 3)
				{ keyword: 'ABC', start: 0, end: 3 },
				// B: [2, 4) - Overlaps with A at 2, but ends later (4 > 3)
				{ keyword: 'BC', start: 2, end: 4 },
			];
			// Should keep BC because it extends further than ABC.
			const result = antennaService.deduplicateOverlappingMatches(matches);
			expect(result).toHaveLength(1);
			expect(result[0].keyword).toBe('BC');
		});

		it('handles nested matches properly (longer one preferred if starts earlier)', () => {
			const matches: any[] = [
				// A: [0, 5)
				{ keyword: 'ABCDE', start: 0, end: 5 },
				// B: [1, 4) "BCD" inside A
				{ keyword: 'BCD', start: 1, end: 4 },
			];
			const result = antennaService.deduplicateOverlappingMatches(matches);
			expect(result).toHaveLength(1);
			expect(result[0].keyword).toBe('ABCDE');
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

		it('AND intersection: "ABC" AND "BC" -> Miss (Score < Group Count)', async () => {
			// Keywords: [['ABC', 'BC']] (AND logic)
			// Text: ABC
			// Match ABC: [0, 3)
			// Match BC: [1, 3)
			// Per-Group Deduplication:
			// Group 0 ("ABC", "BC"):
			//    Matches: ABC [0, 3), BC [1, 3).
			//   Dedupe: "BC" is shorter than "ABC" and overlaps within same group. "ABC" kept.
			//   Group Checks: 'ABC' found? Yes. 'BC' found? NO (deduplicated away).
			// Group result: False (NOT all keywords found)
			const antenna = {
				...baseAntenna,
				keywords: [['ABC', 'BC']],
			};
			const result = await antennaService.checkHitAntenna(antenna, mockNote, mockUser);
			expect(result).toBe(false);
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
});
