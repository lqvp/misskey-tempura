/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export interface TempuraChangelogEntry {
	version: string;
	context: Record<string, string[]>;
}

const isHorizontalRule = (line: string): boolean => /^\s*-{3,}\s*$/.test(line);
const matchHeading = (line: string): { level: number; text: string } | null => {
	const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
	if (!match) return null;
	return { level: match[1].length, text: match[2] };
};

const matchBullet = (line: string): { indent: number; text: string } | null => {
	const match = /^(\s*)([*-])\s+(.+?)\s*$/.exec(line);
	if (!match) return null;
	return { indent: match[1].length, text: match[3] };
};

/**
 * Parse misskey-tempura changelog markdown.
 *
 * Supported (examples):
 * - Version section starts with `# 1.9.10`
 * - Optional `Base: ...` line (kept under `Base` category)
 * - Categories: `## Frontend`, `### Backend`, etc.
 * - Items: bullet lines (`* ...` / `- ...`) and plain text lines
 */
export function parseTempuraChangelogMarkdown(markdown: string | null | undefined): TempuraChangelogEntry[] {
	if (markdown == null) return [];

	const normalized = markdown.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
	const lines = normalized.split('\n');

	const entries: TempuraChangelogEntry[] = [];

	let current: TempuraChangelogEntry | null = null;
	let currentCategory = 'General';

	const ensureCategory = (category: string) => {
		if (!current) return;
		if (!current.context[category]) current.context[category] = [];
	};

	const pushItem = (item: string) => {
		if (!current) return;
		const text = item.trim();
		if (text.length === 0) return;
		ensureCategory(currentCategory);
		current.context[currentCategory]!.push(text);
	};

	const appendToLastItem = (line: string) => {
		if (!current) return;
		ensureCategory(currentCategory);
		const items = current.context[currentCategory]!;
		const text = line.trim();
		if (text.length === 0) return;
		if (items.length === 0) {
			items.push(text);
			return;
		}
		items[items.length - 1] = `${items[items.length - 1]}\n${text}`;
	};

	const finalize = () => {
		if (!current) return;

		for (const key of Object.keys(current.context)) {
			if (current.context[key]?.length === 0) delete current.context[key];
		}

		if (Object.keys(current.context).length > 0) {
			entries.push(current);
		}
		current = null;
		currentCategory = 'General';
	};

	for (const line of lines) {
		const heading = matchHeading(line);
		if (heading && heading.level === 1) {
			finalize();
			current = { version: heading.text, context: { Base: [], General: [] } };
			currentCategory = 'General';
			continue;
		}

		if (!current) {
			continue;
		}

		if (isHorizontalRule(line)) {
			finalize();
			continue;
		}

		if (/^\s*Base:\s*/.test(line)) {
			const base = line.replace(/^\s*Base:\s*/, '').trim();
			if (base.length > 0) {
				ensureCategory('Base');
				current.context['Base']!.push(base);
			}
			continue;
		}

		if (heading && heading.level >= 2) {
			currentCategory = heading.text;
			ensureCategory(currentCategory);
			continue;
		}

		if (line.trim().length === 0) {
			continue;
		}

		const bullet = matchBullet(line);
		if (bullet) {
			if (bullet.indent >= 2) {
				appendToLastItem(`* ${bullet.text}`);
			} else {
				pushItem(bullet.text);
			}
			continue;
		}

		if (/^\s+/.test(line)) {
			appendToLastItem(line.trim());
			continue;
		}

		pushItem(line);
	}

	finalize();
	return entries;
}
