/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type FeatureItem = { text: string; children: string[] };
export type FeatureGroup = { title: string; paragraphs: string[]; items: FeatureItem[] };
export type FeatureSection = { id: string; title: string; groups: FeatureGroup[] };

/** The heading, paragraph and nested-list subset used by diff.md. */
export function parseFeatureCatalog(markdown: string): { introduction: string; notes: string[]; sections: FeatureSection[] } {
	const sections: FeatureSection[] = [];
	const introduction: string[] = [];
	const notes: string[] = [];
	let section: FeatureSection | undefined;
	let group: FeatureGroup | undefined;
	let item: FeatureItem | undefined;
	let inNotes = false;
	let paragraphContinues = false;

	for (const raw of markdown.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith('# ')) {
			paragraphContinues = false;
			continue;
		}
		if (line.startsWith('## ')) {
			section = { id: `section-${sections.length + 1}`, title: line.slice(3), groups: [] };
			sections.push(section);
			group = undefined;
			item = undefined;
			paragraphContinues = false;
			continue;
		}
		if (!section) {
			if (line === '注意事項') {
				inNotes = true;
			} else if (line.startsWith('* ')) {
				notes.push(line.slice(2));
			} else if (!inNotes) {
				introduction.push(line);
			}
			continue;
		}
		if (!group || line.startsWith('### ')) {
			group = { title: line.startsWith('### ') ? line.slice(4) : '', paragraphs: [], items: [] };
			section.groups.push(group);
			item = undefined;
			paragraphContinues = false;
			if (line.startsWith('### ')) continue;
		}
		if (line.startsWith('* ')) {
			if (/^\s+\*/.test(raw) && item) {
				item.children.push(line.slice(2));
			} else {
				item = { text: line.slice(2), children: [] };
				group.items.push(item);
			}
			paragraphContinues = false;
		} else if (/^\s+/.test(raw) && item) {
			if (item.children.length) {
				item.children[item.children.length - 1] += ` ${line}`;
			} else {
				item.text += ` ${line}`;
			}
		} else {
			if (paragraphContinues) {
				group.paragraphs[group.paragraphs.length - 1] += ` ${line}`;
			} else {
				group.paragraphs.push(line);
			}
			paragraphContinues = true;
			item = undefined;
		}
	}

	return { introduction: introduction.join(' '), notes, sections };
}

function normalize(text: string): string {
	return text.normalize('NFKC').toLowerCase();
}

/** Search globally, preserving category/subheading and parent-list context. */
export function searchFeatureCatalog(sections: FeatureSection[], query: string): FeatureSection[] {
	const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
	if (!terms.length) return sections;
	const matches = (...texts: string[]): boolean => {
		const text = normalize(texts.join(' '));
		return terms.every(term => text.includes(term));
	};

	return sections.flatMap(section => {
		const groups = section.groups.flatMap(group => {
			if (matches(section.title, group.title, ...group.paragraphs)) return [group];
			const items = group.items.filter(item => matches(section.title, group.title, item.text, ...item.children));
			return items.length ? [{ ...group, items }] : [];
		});
		return groups.length ? [{ ...section, groups }] : [];
	});
}

export function countFeatureItems(section: FeatureSection): number {
	return section.groups.reduce((count, group) => count + group.items.length, 0);
}
