/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { LlmUsageService } from '@/core/LlmUsageService.js';
import { period, overviewSchema } from './schemas.js';
export const meta = { tags: ['admin'], requireCredential: true, requireAdmin: true, kind: 'read:admin:llm-usage', limit: { duration: 60000, max: 60 }, res: overviewSchema } as const;
export const paramDef = { type: 'object', properties: { ...period }, required: ['year', 'month'] } as const;
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
 constructor(service: LlmUsageService) { super(meta, paramDef, async ps => service.readMonth(ps.year, ps.month)); }
}
