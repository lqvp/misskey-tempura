/*
 * SPDX-FileCopyrightText: chan-mai
 * SPDX-License-Identifier: AGPL-3.0-only
*/
import { Test, TestingModule } from '@nestjs/testing';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { AntennaService } from '../../src/core/AntennaService.js';
import { DI } from '../../src/di-symbols.js';
import { GlobalEventService } from '../../src/core/GlobalEventService.js';
import { UtilityService } from '../../src/core/UtilityService.js';
import { FanoutTimelineService } from '../../src/core/FanoutTimelineService.js';
import { CacheService } from '../../src/core/CacheService.js';

describe('AntennaService', () => {
    let antennaService: AntennaService;

    // Mock dependencies
    const mockRedisForTimelines = { pipeline: jest.fn(() => ({ exec: jest.fn() })) };
    const mockRedisForSub = { on: jest.fn(), off: jest.fn() };
    const mockAntennasRepository = {};
    const mockUserListMembershipsRepository = {};
    const mockCacheService = { userFollowingsCache: { fetch: jest.fn() } };
    const mockUtilityService = { getFullApAccount: jest.fn() };
    const mockGlobalEventService = { publishAntennaStream: jest.fn() };
    const mockFanoutTimelineService = { push: jest.fn() };

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

        it('Classic: Must Exclude keywords (Hard Block)', async () => {
            const antenna = { ...baseAntenna, keywords: [['apple']], mustExcludeKeywords: [['banana']] };
            const result = await antennaService.checkHitAntenna(antenna, mockNote, mockUser);
            expect(result).toBe(false);
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
                mustExcludeKeywords: [['banana']] // But banana is forbidden
            };
            const result = await antennaService.checkHitAntenna(antenna, mockNote, mockUser);
            expect(result).toBe(false);
        });
    });
});
