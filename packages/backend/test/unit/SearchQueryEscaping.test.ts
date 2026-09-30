/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { Brackets } from 'typeorm';
import { SearchService, type SearchOpts } from '@/core/SearchService.js';

async function compile(q: string, opts: SearchOpts) {
	const parameters: Record<string, string> = {};
	const conditions: string[] = [];
	const query: any = {};
	for (const method of ['innerJoinAndSelect', 'leftJoinAndSelect', 'limit']) {
		query[method] = () => query;
	}
	query.andWhere = (condition: string | Brackets, params: Record<string, string>) => {
		Object.assign(parameters, params);
		if (condition instanceof Brackets) {
			const qb: any = {
				where: (value: string) => { conditions.push(value); return qb; },
				orWhere: (value: string) => { conditions.push(value); return qb; },
			};
			condition.whereFactory(qb);
		} else {
			conditions.push(condition);
		}
		return query;
	};
	query.getMany = async () => [];
	const service: SearchService = Object.assign(Object.create(SearchService.prototype), {
		provider: 'sqlPgroonga', config: { fulltextSearch: { provider: 'sqlPgroonga' } },
		notesRepository: { createQueryBuilder: () => query },
		queryService: { makePaginationQuery: () => query, generateVisibilityQuery: vi.fn(), generateBaseNoteFilteringQuery: vi.fn() },
	});
	await service.searchNote(q, null, opts, { limit: 10 });
	return { parameters, conditions };
}

describe('PGroonga search query compilation', () => {
	test('quotes and backslashes survive in positive and excluded terms', async () => {
		const term = 'a"b\\c';
		const { parameters } = await compile(term, { excludeWords: [term] });
		expect(parameters).toEqual({ pgQuery: '"a\\"b\\\\c"', pgExclude0: '"a\\"b\\\\c"' });
	});

	test.each(['and', 'or'] as const)('advanced %s exclusions use SQL NOT alongside explicit exclusions', async searchOperator => {
		const { parameters, conditions } = await compile(searchOperator === 'or' ? 'cat OR -dog OR bird' : 'cat -dog bird', {
			advancedSyntax: true, searchOperator, excludeWords: ['fish'],
		});
		expect(parameters.pgExclude0).toBe('"fish"');
		expect(parameters.pgExclude1).toBe('"dog"');
		expect(conditions).toContain('NOT (note.text &@~ :pgExclude1)');
		if (searchOperator === 'or') {
			expect(parameters.pgQuery0).toBe('"cat"');
			expect(parameters.pgQuery1).toBe('"bird"');
		} else {
			expect(parameters.pgQuery).toBe('"cat" "bird"');
		}
	});

	test('exclusion-only search needs no positive PGroonga query', async () => {
		const { parameters } = await compile('-cat -dog', { advancedSyntax: true });
		expect(parameters).toEqual({ pgExclude0: '"cat"', pgExclude1: '"dog"' });
	});

	test('disabled advanced syntax and lone minus stay literal', async () => {
		expect((await compile('-cat -', {})).parameters).toEqual({ pgQuery: '"-cat" "-"' });
		expect((await compile('-', { advancedSyntax: true })).parameters).toEqual({ pgQuery: '"-"' });
	});
});
