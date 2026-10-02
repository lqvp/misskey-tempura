/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import SearchEndpoint from '@/server/api/endpoints/notes/search.js';
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

describe('notes/search term boundaries', () => {
	test.each([
		['cat +(dog bird) fish', true, 'or', 'cat OR +(dog bird) OR fish'],
		['cat +((dog bird) fish)\tfox', true, 'or', 'cat OR +((dog bird) fish) OR fox'],
		['  +(犬　猫\n鳥)  魚 ', true, 'or', '+(犬　猫\n鳥) OR 魚'],
		['cat +(dog bird', true, 'or', 'cat OR +(dog OR bird'],
		['cat dog) bird', true, 'or', 'cat OR dog) OR bird'],
		['cat +(dog bird)', false, 'or', 'cat OR +(dog OR bird)'],
		['cat +(dog bird)', true, 'and', 'cat +(dog bird)'],
		['cat%20dog %ZZ', true, 'or', 'cat dog OR %ZZ'],
	] as const)('parses %s (advanced=%s, operator=%s)', async (query, advancedSyntax, searchOperator, expected) => {
		const searchNote = vi.fn().mockResolvedValue([]);
		const endpoint = new SearchEndpoint({ packMany: async (notes: any) => notes } as any, { searchNote } as any,
			{ getUserPolicies: async () => ({ canSearchNotes: true }) } as any, {} as any);
		await endpoint.exec({ query, advancedSyntax, searchOperator }, null, null);
		expect(searchNote.mock.calls[0][0]).toBe(expected);
	});

	test('+(dog bird) compiles as a Groonga group, not a quoted phrase', async () => {
		// AND検索では括弧付きトークンが1トークンとして compileTerm に届く。
		// グループ記号はそのまま、内部の語だけ個別に引用されること。
		const { parameters } = await compile('cat +(dog bird) fish', { advancedSyntax: true, searchOperator: 'and' });
		expect(parameters.pgQuery).toBe('"cat" +("dog" "bird") "fish"');
		// OR検索でもグループは保たれる
		const { parameters: orParams } = await compile('cat OR +(dog bird)', { advancedSyntax: true, searchOperator: 'or' });
		expect(orParams.pgQuery0).toBe('"cat"');
		expect(orParams.pgQuery1).toBe('+("dog" OR "bird")');
	});

	test('closing parenthesis first falls back to quoting the whole term', async () => {
		// 開閉の個数が同じでも ')' が先頭に来るトークンはグループとして扱わない
		const { parameters } = await compile('dog)(cat', { advancedSyntax: true, searchOperator: 'and' });
		expect(parameters.pgQuery).toBe('"dog)(cat"');
		const { parameters: nested } = await compile('+(dog bird', { advancedSyntax: true, searchOperator: 'and' });
		// 閉じ括弧が無いトークンは regroupBalanced が従来どおり空白で分割し、
		// 括弧を含む語はcompileTerm が丸ごと引用する
		expect(nested.pgQuery).toBe('"+(dog" "bird"');
	});
});
