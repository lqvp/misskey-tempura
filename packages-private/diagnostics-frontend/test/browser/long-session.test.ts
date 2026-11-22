/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from 'vitest';
import { countRetainedMatchReasons } from '../../src/browser/long-session';

test('counts distinct workload notes referenced by reason records only', () => {
	const snapshot = {
		snapshot: {
			meta: {
				node_fields: ['type', 'edge_count'],
				edge_fields: ['type', 'name_or_index', 'to_node'],
				edge_types: [['element', 'property']],
			},
		},
		nodes: [0, 4, 0, 2, 0, 1],
		edges: [
			1, 0, 2,
			1, 0, 2,
			1, 1, 4,
			1, 2, 2,
			1, 3, 4,
			1, 4, 4,
			1, 3, 4,
		],
		strings: ['listed', 'unrelated', 'notPosted', 'matchedKeywords', 'matchedExcludeKeywords'],
	};
	expect(countRetainedMatchReasons(snapshot, new Set(['listed', 'unrelated', 'missing']))).toBe(1);
});
