/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';
import { FEATURE_CATALOG_COMMENT_OR_CODE_RE } from '@/utility/tempura-script/feature-catalog.js';
import { parseRjNumberTokens } from '@/utility/tms/rj-number-parser.js';

export type FeatureCatalogLintRule =
	| 'unsupported-syntax'
	| 'manual-version'
	| 'legacy-url'
	| 'date-section'
	| 'relative-time'
	| 'positional-reference'
	| 'duplicate-heading'
	| 'empty-section'
	| 'empty-group'
	| 'broken-cross-reference'
	| 'multiline-japanese'
	| 'ascii-only-item'
	| 'too-many-children'
	| 'mfm-unexpected-node'
	| 'paragraph-markup'
	| 'paragraph-after-items';

export type FeatureCatalogLintIssue = {
	rule: FeatureCatalogLintRule;
	line?: number;
	message: string;
};

type VisibleLine = {
	raw: string;
	line: number;
};

type OpenCodeFence = {
	char: '`' | '~';
	len: number;
};

type ParsedItemWithLine = {
	text: string;
	line: number;
	children: { text: string; line: number }[];
};

type ParsedGroupWithLine = {
	title: string;
	line: number;
	paragraphs: { text: string; line: number }[];
	items: ParsedItemWithLine[];
};

type ParsedSectionWithLine = {
	title: string;
	line: number;
	groups: ParsedGroupWithLine[];
};

const MAX_CHILDREN_PER_ITEM = 4;

const ALLOWED_MFM_NODE_TYPES = new Set<mfm.MfmNode['type']>([
	'text',
	'bold',
	'inlineCode',
	'unicodeEmoji',
	'url',
	'link',
]);

const INLINE_CODE_SPAN_RE = /(?<!`)(`+)(?!`)[^\r\n]*?(?<!`)\1(?!`)/g;
const SINGLE_INLINE_CODE_RE = /`[^`\n]+`/g;
const JAPANESE_CHAR_RE = /[\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF々〆〇ヶ]/;
const DATE_SECTION_RE = /^\d{4}-\d{2}-\d{2}/;
const MANUAL_VERSION_RE = /(?:(?<![\d.])20\d{2}\.\d+|tempura-\d|(?<![a-zA-Z0-9_])v\d+\.\d+\.\d+\b)/i;
const RELATIVE_TIME_RE = /このバージョンで|この変更より前|前回のリリース/;
const POSITIONAL_REFERENCE_RE = /上記参照|下記参照/;
const CROSS_REFERENCE_RE = /詳細は「([^」]+)」を参照/g;
const NON_HTTP_MARKDOWN_LINK_RE = /\[[^\]]+\]\((?!https?:\/\/)[^)]+\)/;
const MARKDOWN_LINK_RE = /\[[^\]]+\]\([^)]+\)/;
const RAW_HTML_TAG_RE = /<(?:\/[a-zA-Z][a-zA-Z0-9-]*\s*|[a-zA-Z][a-zA-Z0-9-]*(?:\s+[a-zA-Z_:][a-zA-Z0-9_.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?)>/;
const H4_OR_DEEPER_RE = /^\s*#{4,}\s/;
const OPEN_CODE_FENCE_RE = /^\s*(`{3,}|~{3,})(.*)$/;
const CLOSE_BACKTICK_FENCE_RE = /^\s*(`{3,})\s*$/;
const CLOSE_TILDE_FENCE_RE = /^\s*(~{3,})\s*$/;
const MARKDOWN_TABLE_RE = /^\s*\|.+\|\s*$/;
const GFM_TABLE_DELIMITER_RE = /^\s*\|?\s*:?-{1,}:?\s*(?:\|\s*:?-{1,}:?\s*)+\|?\s*$/;
const NUMBERED_LIST_RE = /^\s*\d+[.)]\s/;
const HYPHEN_LIST_RE = /^\s*-\s/;
const PLUS_LIST_RE = /^\s*\+\s/;
const BLOCKQUOTE_RE = /^\s*>\s/;
const HORIZONTAL_RULE_RE = /^\s*(?:---+|\*\*\*+|___+)\s*$/;
const BULLET_CANDIDATE_RE = /^\s*\*(?:\s|$)/;
const VALID_PARENT_BULLET_RE = /^\* (?=\S)/;
const VALID_CHILD_BULLET_RE = /^ {2}\* (?=\S)/;

function getVisibleLines(markdown: string): VisibleLine[] {
	const lines: VisibleLine[] = [];
	let current = '';
	let currentLine = 1;
	let origLine = 1;
	let lastIndex = 0;

	const appendChunk = (chunk: string) => {
		const parts = chunk.split(/\r?\n/);
		for (let i = 0; i < parts.length; i++) {
			if (i > 0) {
				lines.push({ raw: current, line: currentLine });
				origLine++;
				current = '';
				currentLine = origLine;
			}
			current += parts[i];
		}
	};

	for (const match of markdown.matchAll(FEATURE_CATALOG_COMMENT_OR_CODE_RE)) {
		const index = match.index;
		if (index > lastIndex) {
			appendChunk(markdown.slice(lastIndex, index));
		}
		const matched = match[0];
		if (matched.startsWith('<!--')) {
			const newlines = matched.match(/\r?\n/g)?.length ?? 0;
			origLine += newlines;
			if (current === '') {
				currentLine = origLine;
			}
		} else {
			appendChunk(matched);
		}
		lastIndex = index + matched.length;
	}

	if (lastIndex < markdown.length) {
		appendChunk(markdown.slice(lastIndex));
	}
	lines.push({ raw: current, line: currentLine });
	return lines;
}

function isClosingCodeFence(raw: string, openFence: OpenCodeFence): boolean {
	const match = raw.match(openFence.char === '`' ? CLOSE_BACKTICK_FENCE_RE : CLOSE_TILDE_FENCE_RE);
	return match != null && match[1].length >= openFence.len;
}

function parseOpeningCodeFence(raw: string): { isFenceLine: boolean; opensBlock: OpenCodeFence | null } {
	const match = raw.match(OPEN_CODE_FENCE_RE);
	if (!match) {
		return { isFenceLine: false, opensBlock: null };
	}
	const marker = match[1];
	const char = marker[0] as '`' | '~';
	const rest = match[2];
	// Per CommonMark, backtick fence info strings cannot contain backticks (so ```foo``` is not an opening fence).
	// Tilde fence info strings may contain tildes (e.g. ~~~ lang~variant).
	if (char === '`' && rest.includes('`')) {
		return { isFenceLine: true, opensBlock: null };
	}
	return { isFenceLine: true, opensBlock: { char, len: marker.length } };
}

function collectSectionTitles(visibleLines: VisibleLine[]): Set<string> {
	const titles = new Set<string>();
	let openFence: OpenCodeFence | null = null;

	for (const { raw } of visibleLines) {
		if (openFence) {
			if (isClosingCodeFence(raw, openFence)) {
				openFence = null;
			}
			continue;
		}
		const fence = parseOpeningCodeFence(raw);
		if (fence.isFenceLine) {
			openFence = fence.opensBlock;
			continue;
		}
		const trimmed = raw.trim();
		if (trimmed.startsWith('## ')) {
			titles.add(trimmed.slice(3).trim());
		}
	}

	return titles;
}

function checkPlainTextMarkup(text: string, line: number, issues: FeatureCatalogLintIssue[]): void {
	if (text.includes('`') || text.includes('**') || MARKDOWN_LINK_RE.test(text)) {
		issues.push({
			rule: 'paragraph-markup',
			line,
			message: 'プレーンテキスト描画領域 (導入文・段落・注意事項) にバッククォート、**、または Markdown リンクは使用できません',
		});
	}
}

function checkMfmText(text: string, line: number, issues: FeatureCatalogLintIssue[]): void {
	if (text.includes('``')) {
		issues.push({
			rule: 'mfm-unexpected-node',
			line,
			message: '二重バッククォートは MFM のインラインコードとして解釈されません (単一バッククォートを使用してください)',
		});
	}

	const withoutSingleCode = text.replace(SINGLE_INLINE_CODE_RE, '');
	const relativeLinkMatch = withoutSingleCode.match(NON_HTTP_MARKDOWN_LINK_RE);
	if (relativeLinkMatch) {
		issues.push({
			rule: 'mfm-unexpected-node',
			line,
			message: `相対または非 HTTP(S) の Markdown リンクは MFM でリンク化されません: ${relativeLinkMatch[0]}`,
		});
	}

	const ast = mfm.parse(text);
	const walk = (nodes: mfm.MfmNode[], disableTextTransform: boolean) => {
		for (const node of nodes) {
			if (!ALLOWED_MFM_NODE_TYPES.has(node.type)) {
				issues.push({
					rule: 'mfm-unexpected-node',
					line,
					message: `許可されていない MFM ノード種別 "${node.type}" が検出されました`,
				});
				continue;
			}

			if (node.type === 'text' && !disableTextTransform) {
				for (const segment of node.props.text.split('\n')) {
					for (const token of parseRjNumberTokens(segment)) {
						if (token.type !== 'text') {
							issues.push({
								rule: 'mfm-unexpected-node',
								line,
								message: `意図しない自動リンク化 (rj-number) が検出されました: ${token.value}`,
							});
						}
					}
				}
			}

			if ('children' in node && Array.isArray(node.children)) {
				walk(node.children, disableTextTransform || node.type === 'link');
			}
		}
	};

	walk(ast, false);
}

/**
 * Pure structural, prose-guard, and MFM safety validator for diff.md.
 */
export function lintFeatureCatalog(markdown: string): FeatureCatalogLintIssue[] {
	const issues: FeatureCatalogLintIssue[] = [];
	const visibleLines = getVisibleLines(markdown);
	const sectionTitles = collectSectionTitles(visibleLines);

	const sections: ParsedSectionWithLine[] = [];
	const seenSections = new Set<string>();
	const seenGroups = new Set<string>();
	const introductionLines: string[] = [];

	let currentSection: ParsedSectionWithLine | undefined;
	let currentGroup: ParsedGroupWithLine | undefined;
	let currentItem: ParsedItemWithLine | undefined;
	let inNotes = false;
	let openFence: OpenCodeFence | null = null;
	let inGfmTable = false;
	let paragraphContinues = false;
	let prevParagraphLine = '';

	for (let i = 0; i < visibleLines.length; i++) {
		const { raw, line } = visibleLines[i];

		if (openFence) {
			if (isClosingCodeFence(raw, openFence)) {
				openFence = null;
			}
			continue;
		}

		const fence = parseOpeningCodeFence(raw);
		if (fence.isFenceLine) {
			issues.push({
				rule: 'unsupported-syntax',
				line,
				message: 'コードブロックは非対応です',
			});
			openFence = fence.opensBlock;
			inGfmTable = false;
			paragraphContinues = false;
			continue;
		}

		const trimmed = raw.trim();
		if (!trimmed) {
			inGfmTable = false;
			paragraphContinues = false;
			continue;
		}

		// Global visible-line guards
		if (MANUAL_VERSION_RE.test(raw)) {
			issues.push({
				rule: 'manual-version',
				line,
				message: `バージョン番号を手書きしないでください: ${trimmed}`,
			});
		}

		if (raw.includes('/tempura-changelog')) {
			issues.push({
				rule: 'legacy-url',
				line,
				message: '旧 URL /tempura-changelog が残っています (/tempura-diff を使用してください)',
			});
		}

		if (RELATIVE_TIME_RE.test(raw)) {
			issues.push({
				rule: 'relative-time',
				line,
				message: '相対時間表現 (このバージョンで / この変更より前 / 前回のリリース) は使用できません',
			});
		}

		if (POSITIONAL_REFERENCE_RE.test(raw)) {
			issues.push({
				rule: 'positional-reference',
				line,
				message: '位置依存参照 (上記参照 / 下記参照) は使用できません',
			});
		}

		for (const refMatch of raw.matchAll(CROSS_REFERENCE_RE)) {
			const target = refMatch[1];
			if (!sectionTitles.has(target)) {
				issues.push({
					rule: 'broken-cross-reference',
					line,
					message: `参照先カテゴリ「${target}」が存在しません`,
				});
			}
		}

		const withoutInlineCode = raw.replace(INLINE_CODE_SPAN_RE, '');

		// Unsupported syntax checks
		let isBlockUnsupported = false;
		const nextRaw = visibleLines[i + 1]?.raw;
		const isGfmTableHeader = !trimmed.startsWith('#')
			&& !BULLET_CANDIDATE_RE.test(raw)
			&& withoutInlineCode.includes('|')
			&& nextRaw != null
			&& GFM_TABLE_DELIMITER_RE.test(nextRaw);

		if (H4_OR_DEEPER_RE.test(raw)) {
			issues.push({
				rule: 'unsupported-syntax',
				line,
				message: 'H4 以降の見出しは非対応です',
			});
			isBlockUnsupported = true;
			inGfmTable = false;
		} else if (MARKDOWN_TABLE_RE.test(raw)) {
			issues.push({
				rule: 'unsupported-syntax',
				line,
				message: 'Markdown 表は非対応です',
			});
			isBlockUnsupported = true;
			inGfmTable = true;
		} else if (isGfmTableHeader) {
			issues.push({
				rule: 'unsupported-syntax',
				line,
				message: 'Markdown 表は非対応です',
			});
			isBlockUnsupported = true;
			inGfmTable = true;
		} else if (GFM_TABLE_DELIMITER_RE.test(raw)) {
			if (!inGfmTable) {
				issues.push({
					rule: 'unsupported-syntax',
					line,
					message: 'Markdown 表は非対応です',
				});
			}
			isBlockUnsupported = true;
			inGfmTable = true;
		} else if (inGfmTable && !trimmed.startsWith('#') && !BULLET_CANDIDATE_RE.test(raw) && withoutInlineCode.includes('|')) {
			// Subsequent rows of an already-reported GFM table without outer pipes.
			isBlockUnsupported = true;
		} else if (NUMBERED_LIST_RE.test(raw)) {
			issues.push({
				rule: 'unsupported-syntax',
				line,
				message: '番号付きリストは非対応です',
			});
			isBlockUnsupported = true;
			inGfmTable = false;
		} else if (HYPHEN_LIST_RE.test(raw)) {
			issues.push({
				rule: 'unsupported-syntax',
				line,
				message: '"- " 箇条書きは非対応です ("* " を使用してください)',
			});
			isBlockUnsupported = true;
			inGfmTable = false;
		} else if (PLUS_LIST_RE.test(raw)) {
			issues.push({
				rule: 'unsupported-syntax',
				line,
				message: '"+ " 箇条書きは非対応です ("* " を使用してください)',
			});
			isBlockUnsupported = true;
			inGfmTable = false;
		} else if (BLOCKQUOTE_RE.test(raw)) {
			issues.push({
				rule: 'unsupported-syntax',
				line,
				message: '引用ブロック ("> ") は非対応です',
			});
			isBlockUnsupported = true;
			inGfmTable = false;
		} else if (HORIZONTAL_RULE_RE.test(raw)) {
			issues.push({
				rule: 'unsupported-syntax',
				line,
				message: '水平線は非対応です',
			});
			isBlockUnsupported = true;
			inGfmTable = false;
		} else {
			inGfmTable = false;
		}

		const isInvalidBullet = BULLET_CANDIDATE_RE.test(raw)
			&& !VALID_PARENT_BULLET_RE.test(raw)
			&& !VALID_CHILD_BULLET_RE.test(raw);
		if (isInvalidBullet) {
			issues.push({
				rule: 'unsupported-syntax',
				line,
				message: '箇条書きの書式またはインデントが不正です (親項目は "* "、子項目は半角空白 2 個 + "* " にしてください)',
			});
			if (!trimmed.startsWith('* ')) {
				isBlockUnsupported = true;
			}
		}

		if (RAW_HTML_TAG_RE.test(withoutInlineCode)) {
			issues.push({
				rule: 'unsupported-syntax',
				line,
				message: 'バッククォート外の生 HTML タグは非対応です',
			});
		}

		if (trimmed.startsWith('# ')) {
			paragraphContinues = false;
			continue;
		}

		if (trimmed.startsWith('## ')) {
			const title = trimmed.slice(3).trim();
			if (DATE_SECTION_RE.test(title)) {
				issues.push({
					rule: 'date-section',
					line,
					message: `日付付き変更セクションは廃止されました: ${title}`,
				});
			}
			if (seenSections.has(title)) {
				issues.push({
					rule: 'duplicate-heading',
					line,
					message: `重複したカテゴリ見出しです: ${title}`,
				});
			}
			seenSections.add(title);
			seenGroups.clear();

			currentSection = { title, line, groups: [] };
			sections.push(currentSection);
			currentGroup = undefined;
			currentItem = undefined;
			paragraphContinues = false;
			continue;
		}

		if (!currentSection) {
			if (trimmed === '注意事項') {
				inNotes = true;
				continue;
			}
			if (isBlockUnsupported) {
				continue;
			}
			if (trimmed.startsWith('* ')) {
				if (VALID_CHILD_BULLET_RE.test(raw)) {
					issues.push({
						rule: 'unsupported-syntax',
						line,
						message: '注意事項や導入部では子箇条書き ("  * ") は非対応です',
					});
				}
				const text = trimmed.slice(2);
				checkPlainTextMarkup(text, line, issues);
				if (!JAPANESE_CHAR_RE.test(text)) {
					issues.push({
						rule: 'ascii-only-item',
						line,
						message: `日本語を含まない項目です: ${text}`,
					});
				}
			} else if (!inNotes) {
				if (
					introductionLines.length > 0
					&& (JAPANESE_CHAR_RE.test(introductionLines[introductionLines.length - 1]) || JAPANESE_CHAR_RE.test(trimmed))
				) {
					issues.push({
						rule: 'multiline-japanese',
						line,
						message: '導入文が複数行に分かれています (1 段落 1 行にしてください)',
					});
				}
				checkPlainTextMarkup(trimmed, line, issues);
				introductionLines.push(trimmed);
			} else {
				// Any non-"* " line after 注意事項 (including indented continuation lines) is silently dropped by parseFeatureCatalog.
				issues.push({
					rule: 'unsupported-syntax',
					line,
					message: '注意事項の後に "* " 箇条書き以外の行は置けません (画面では無視されます)',
				});
			}
			continue;
		}

		if (trimmed.startsWith('### ')) {
			const title = trimmed.slice(4).trim();
			if (seenGroups.has(title)) {
				issues.push({
					rule: 'duplicate-heading',
					line,
					message: `同一カテゴリ内で重複した小見出しです: ${title}`,
				});
			}
			seenGroups.add(title);
			currentGroup = { title, line, paragraphs: [], items: [] };
			currentSection.groups.push(currentGroup);
			currentItem = undefined;
			paragraphContinues = false;
			continue;
		}

		if (isBlockUnsupported) {
			paragraphContinues = false;
			continue;
		}

		if (!currentGroup) {
			currentGroup = { title: '', line, paragraphs: [], items: [] };
			currentSection.groups.push(currentGroup);
		}

		if (trimmed.startsWith('* ')) {
			const text = trimmed.slice(2);
			if (/^\s+\*/.test(raw)) {
				if (currentItem) {
					currentItem.children.push({ text, line });
				} else {
					if (VALID_CHILD_BULLET_RE.test(raw)) {
						issues.push({
							rule: 'unsupported-syntax',
							line,
							message: '親項目のない孤立した子箇条書きです (親項目 "* " の直下に配置してください)',
						});
					}
					currentItem = { text, line, children: [] };
					currentGroup.items.push(currentItem);
				}
			} else {
				currentItem = { text, line, children: [] };
				currentGroup.items.push(currentItem);
			}
			paragraphContinues = false;
		} else if (/^\s+/.test(raw) && currentItem) {
			const target = currentItem.children.length
				? currentItem.children[currentItem.children.length - 1]
				: currentItem;
			if (JAPANESE_CHAR_RE.test(target.text) || JAPANESE_CHAR_RE.test(trimmed)) {
				issues.push({
					rule: 'multiline-japanese',
					line,
					message: '箇条書き項目が物理改行で折り返されています (1 項目 1 行にしてください)',
				});
			}
			target.text += ` ${trimmed}`;
		} else {
			if (!paragraphContinues && currentGroup.items.length > 0) {
				issues.push({
					rule: 'paragraph-after-items',
					line,
					message: '箇条書きの後に段落が置かれています (画面では箇条書きの上に移動します)',
				});
			}
			if (paragraphContinues) {
				if (JAPANESE_CHAR_RE.test(prevParagraphLine) || JAPANESE_CHAR_RE.test(trimmed)) {
					issues.push({
						rule: 'multiline-japanese',
						line,
						message: '段落が物理改行で折り返されています (1 段落 1 行にしてください)',
					});
				}
				currentGroup.paragraphs[currentGroup.paragraphs.length - 1].text += ` ${trimmed}`;
			} else {
				currentGroup.paragraphs.push({ text: trimmed, line });
			}
			checkPlainTextMarkup(trimmed, line, issues);
			prevParagraphLine = trimmed;
			paragraphContinues = true;
			currentItem = undefined;
		}
	}

	if (sections.length === 0) {
		issues.push({
			rule: 'empty-section',
			line: 1,
			message: 'カテゴリ見出し (##) が 1 件も存在しません',
		});
	}

	for (const section of sections) {
		const sectionHasContent = section.groups.some(group => group.items.length > 0 || group.paragraphs.length > 0);
		if (!sectionHasContent) {
			issues.push({
				rule: 'empty-section',
				line: section.line,
				message: `項目も段落もない空のカテゴリです: ${section.title}`,
			});
		}

		for (const group of section.groups) {
			if (group.items.length === 0 && group.paragraphs.length === 0) {
				issues.push({
					rule: 'empty-group',
					line: group.line,
					message: `項目も段落もない空の小見出しです: ${group.title}`,
				});
			}

			for (const item of group.items) {
				if (item.children.length > MAX_CHILDREN_PER_ITEM) {
					issues.push({
						rule: 'too-many-children',
						line: item.line,
						message: `1 親項目あたりの子項目数が上限 (${MAX_CHILDREN_PER_ITEM}) を超えています (${item.children.length} 件)`,
					});
				}
				if (!JAPANESE_CHAR_RE.test(item.text)) {
					issues.push({
						rule: 'ascii-only-item',
						line: item.line,
						message: `日本語を含まない項目です: ${item.text}`,
					});
				}
				checkMfmText(item.text, item.line, issues);

				for (const child of item.children) {
					if (!JAPANESE_CHAR_RE.test(child.text)) {
						issues.push({
							rule: 'ascii-only-item',
							line: child.line,
							message: `日本語を含まない子項目です: ${child.text}`,
						});
					}
					checkMfmText(child.text, child.line, issues);
				}
			}
		}
	}

	return issues;
}
