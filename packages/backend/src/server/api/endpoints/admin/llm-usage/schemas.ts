/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export const decimal = { type: 'string', optional: false, nullable: false } as const;
const token = { type: 'object', optional: false, nullable: false, properties: { value: { type: 'string', optional: false, nullable: true }, samples: decimal } } as const;
export const counters = { requests: decimal, successes: decimal, failures: decimal, tokens: { type: 'object', optional: false, nullable: false, properties: { input: token, output: token, thinking: token, cached: token, total: token } } } as const;
export const period = { year: { type: 'integer', minimum: 1, maximum: 9998 }, month: { type: 'integer', minimum: 1, maximum: 12 } } as const;
export const overviewSchema = { type: 'object', optional: false, nullable: false, properties: {
 year: { type: 'integer', optional: false, nullable: false }, month: { type: 'integer', optional: false, nullable: false }, timezone: { type: 'string', enum: ['UTC'], optional: false, nullable: false }, startedAt: { type: 'string', optional: false, nullable: false, format: 'date-time' }, retentionMonths: { type: 'integer', optional: false, nullable: false }, summary: { type: 'object', optional: false, nullable: false, properties: counters }, uniqueUsers: decimal,
 daily: { type: 'array', optional: false, nullable: false, items: { type: 'object', optional: false, nullable: false, properties: { date: decimal, ...counters } } },
 byPurpose: { type: 'array', optional: false, nullable: false, items: { type: 'object', optional: false, nullable: false, properties: { purpose: decimal, ...counters } } },
 byModel: { type: 'array', optional: false, nullable: false, items: { type: 'object', optional: false, nullable: false, properties: { model: decimal, ...counters } } },
} } as const;
export const usersSchema = { type: 'object', optional: false, nullable: false, properties: {
 hasMore: { type: 'boolean', optional: false, nullable: false }, items: { type: 'array', optional: false, nullable: false, items: { type: 'object', optional: false, nullable: false, properties: {
 userId: decimal, counters: { type: 'object', optional: false, nullable: false, properties: counters }, user: { type: 'object', optional: false, nullable: true, properties: { username: decimal, name: { type: 'string', optional: false, nullable: true }, host: { type: 'string', optional: false, nullable: true }, avatarUrl: { type: 'string', optional: false, nullable: true } } },
 } } },
} } as const;
