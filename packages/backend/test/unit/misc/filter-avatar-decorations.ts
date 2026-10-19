/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { filterAvatarDecorations } from '@/misc/filter-avatar-decorations.js';

const deco = (name: string, description = '', category: string | null = null) => ({ name, description, category });

const decorations = [
	deco('import_remote.example_x1', 'Imported from remote.example'),
	deco('Star', 'shiny', 'Seasonal'),
	deco('cat_ears', 'nyan'),
	deco('import_other.example_y2', 'Imported from other.example', 'Seasonal'),
	deco('100%_hat'),
];

const names = (xs: { name: string }[]) => xs.map(x => x.name);

describe('filterAvatarDecorations', () => {
	test('returns everything with local first, sorted by name, when query is empty', () => {
		expect(names(filterAvatarDecorations(decorations, { query: '', origin: 'combined' }))).toEqual([
			'100%_hat', 'cat_ears', 'Star', 'import_other.example_y2', 'import_remote.example_x1',
		]);
	});

	test('filters by origin', () => {
		expect(names(filterAvatarDecorations(decorations, { query: '', origin: 'local' }))).toEqual(['100%_hat', 'cat_ears', 'Star']);
		expect(names(filterAvatarDecorations(decorations, { query: '', origin: 'remote' }))).toEqual(['import_other.example_y2', 'import_remote.example_x1']);
	});

	test('matches name, description and category case-insensitively', () => {
		expect(names(filterAvatarDecorations(decorations, { query: 'STAR', origin: 'combined' }))).toEqual(['Star']);
		expect(names(filterAvatarDecorations(decorations, { query: 'nyan', origin: 'combined' }))).toEqual(['cat_ears']);
		expect(names(filterAvatarDecorations(decorations, { query: 'seasonal', origin: 'combined' }))).toEqual(['Star', 'import_other.example_y2']);
	});

	test('treats _ and % literally', () => {
		expect(names(filterAvatarDecorations(decorations, { query: '%_', origin: 'combined' }))).toEqual(['100%_hat']);
		expect(names(filterAvatarDecorations(decorations, { query: 't_e', origin: 'combined' }))).toEqual(['cat_ears']);
	});

	test('does not mutate the input array', () => {
		const input = [...decorations];
		filterAvatarDecorations(input, { query: '', origin: 'combined' });
		expect(input).toEqual(decorations);
	});
});
