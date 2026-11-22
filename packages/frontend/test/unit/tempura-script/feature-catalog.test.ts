/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import markdown from '../../../../../diff.md?raw';
import { countFeatureItems, parseFeatureCatalog, searchFeatureCatalog } from '@/utility/tempura-script/feature-catalog.js';

describe('feature catalog', () => {
	const source = [
		'# Guide',
		'Introduction',
		'注意事項',
		'* Requires a role',
		'## Antennas',
		'### Keyword matching',
		'* RE2 patterns',
		'  * No lookbehind',
		'    supported here',
		'* Plain text',
		'',
		'A paragraph',
		'continued here',
		'## Uploads',
		'* Image processing',
	].join('\r\n');

	test('preserves preamble, headings, nested conditions and multiline paragraphs', () => {
		const document = parseFeatureCatalog(source);
		expect(document.introduction).toBe('Introduction');
		expect(document.notes).toEqual(['Requires a role']);
		expect(document.sections.map(section => section.title)).toEqual(['Antennas', 'Uploads']);
		expect(document.sections[0].groups[0]).toEqual({
			title: 'Keyword matching',
			paragraphs: ['A paragraph continued here'],
			items: [
				{ text: 'RE2 patterns', children: ['No lookbehind supported here'] },
				{ text: 'Plain text', children: [] },
			],
		});
		expect(countFeatureItems(document.sections[0])).toBe(2);
	});

	test('searches normalized text and retains the parent and heading of nested matches', () => {
		const { sections } = parseFeatureCatalog(source);
		const result = searchFeatureCatalog(sections, 'ＡＮＴＥＮＮＡＳ lookbehind');
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(sections[0].id);
		expect(result[0].groups[0].title).toBe('Keyword matching');
		expect(result[0].groups[0].items.map(item => item.text)).toEqual(['RE2 patterns']);
		expect(searchFeatureCatalog(sections, 'uploads')[0].groups[0].items).toHaveLength(1);
		expect(searchFeatureCatalog(sections, 'missing')).toEqual([]);
		expect(searchFeatureCatalog(sections, '  ')).toBe(sections);
		expect(sections[0].groups[0].items).toHaveLength(2);
	});

	test('includes every category and list item from the real single source', () => {
		const document = parseFeatureCatalog(markdown);
		expect(document.sections.map(section => section.title)).toEqual(
			[...markdown.matchAll(/^## (.+)$/gm)].map(match => match[1]),
		);
		const items = document.sections.flatMap(section => section.groups.flatMap(group => group.items));
		expect(items.length + document.notes.length).toBe([...markdown.matchAll(/^\* /gm)].length);
		expect(items.flatMap(item => item.children)).toHaveLength([...markdown.matchAll(/^ +\* /gm)].length);
		expect(searchFeatureCatalog(document.sections, '2026-11-22')[0].title).toBe('2026-11-22 の変更');
		expect(searchFeatureCatalog(document.sections, 'keywordMode')).toHaveLength(1);
	});

	test('handles an empty document', () => {
		expect(parseFeatureCatalog('')).toEqual({ introduction: '', notes: [], sections: [] });
	});
});
