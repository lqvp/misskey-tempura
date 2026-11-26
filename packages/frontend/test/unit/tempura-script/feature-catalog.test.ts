/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import markdown from '../../../../../diff.md?raw';
import {
	countFeatureItems,
	fetchFeatureCatalog,
	parseFeatureCatalog,
	searchFeatureCatalog,
	stripFeatureCatalogComments,
} from '@/utility/tempura-script/feature-catalog.js';
import { lintFeatureCatalog } from '@/utility/tempura-script/feature-catalog-lint.js';
import type { FeatureCatalogLintRule } from '@/utility/tempura-script/feature-catalog-lint.js';

describe('feature catalog', () => {
	const source = [
		'# Guide',
		'Introduction',
		'注意事項',
		'* Requires a role',
		'## Antennas',
		'### Keyword matching',
		'A paragraph',
		'continued here',
		'',
		'* RE2 patterns',
		'  * No lookbehind',
		'    supported here',
		'* Plain text',
		'',
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
		const visible = stripFeatureCatalogComments(markdown);
		const document = parseFeatureCatalog(`<!--\n## Hidden\n* hidden item\n  * hidden child\n-->\n${markdown}`);
		expect(document.sections.map(section => section.title)).toEqual(
			[...visible.matchAll(/^## (.+)$/gm)].map(match => match[1]),
		);
		const items = document.sections.flatMap(section => section.groups.flatMap(group => group.items));
		expect(items.length + document.notes.length).toBe([...visible.matchAll(/^\* /gm)].length);
		expect(items.flatMap(item => item.children)).toHaveLength([...visible.matchAll(/^ +\* /gm)].length);
	});

	test('strips maintainer comments while preserving comment openers in inline code', () => {
		const input = [
			'<!--',
			'## Hidden',
			'-->',
			'## Visible',
			'* HTML `<!--` example <!-- inline secret -->ok',
			'* Two backticks ``<!--`` stay visible',
			'<!-- trailing unfinished comment',
		].join('\n');
		expect(stripFeatureCatalogComments(input)).toBe([
			'',
			'## Visible',
			'* HTML `<!--` example ok',
			'* Two backticks ``<!--`` stay visible',
			'',
		].join('\n'));
	});

	test('strips comments across and within lines after escaped or unpaired backticks with handwritten expectations', () => {
		const sameLineInput = '## 公開カテゴリ\n* 同一行の \\` <!-- 非表示メモ -->と `code` および `<!--` の説明';
		expect(stripFeatureCatalogComments(sameLineInput)).toBe(
			'## 公開カテゴリ\n* 同一行の \\` と `code` および `<!--` の説明',
		);
		const sameLineParsed = parseFeatureCatalog(sameLineInput);
		expect(sameLineParsed.sections.map(section => section.title)).toEqual(['公開カテゴリ']);
		expect(sameLineParsed.sections[0].groups[0].items).toEqual([
			{ text: '同一行の \\` と `code` および `<!--` の説明', children: [] },
		]);
		expect(searchFeatureCatalog(sameLineParsed.sections, '非表示メモ')).toEqual([]);

		const input = [
			'## 公開カテゴリ',
			'* エスケープ済みバッククォート \\` の説明',
			'<!--',
			'## 非表示カテゴリ',
			'* 非表示の項目',
			'  * 非表示の子項目',
			'-->',
			'* 別の行の `インラインコード` 項目',
			'* 閉じない ` バッククォートのある行',
			'<!--',
			'## もう一つの非表示カテゴリ',
			'* 隠すべき項目',
			'-->',
			'* 末尾の `コード` 項目',
		].join('\n');

		const parsed = parseFeatureCatalog(input);
		expect(parsed.sections.map(section => section.title)).toEqual(['公開カテゴリ']);
		expect(parsed.sections[0].groups[0].items).toEqual([
			{ text: 'エスケープ済みバッククォート \\` の説明', children: [] },
			{ text: '別の行の `インラインコード` 項目', children: [] },
			{ text: '閉じない ` バッククォートのある行', children: [] },
			{ text: '末尾の `コード` 項目', children: [] },
		]);
		expect(searchFeatureCatalog(parsed.sections, '非表示')).toEqual([]);
		expect(searchFeatureCatalog(parsed.sections, '隠すべき')).toEqual([]);
	});

	test('shows matching explanations without counting unrelated features', () => {
		const { sections } = parseFeatureCatalog(source);
		const [result] = searchFeatureCatalog(sections, 'antennas paragraph');
		expect(result.groups[0].paragraphs).toEqual(['A paragraph continued here']);
		expect(result.groups[0].items).toEqual([]);
		expect(countFeatureItems(result)).toBe(0);
		expect(searchFeatureCatalog(sections, 'keyword')[0].groups[0].items).toHaveLength(2);
		expect(sections[0].groups[0].items).toHaveLength(2);
	});

	test('handles an empty document', () => {
		expect(parseFeatureCatalog('')).toEqual({ introduction: '', notes: [], sections: [] });
	});

	test('excludes multiline, inline and unfinished maintainer comments from display and search', () => {
		const catalog = parseFeatureCatalog(`<!-- private instructions\n## Hidden\n* secret\n-->\n${source}\n<!-- unfinished secret`);
		expect(catalog).toEqual(parseFeatureCatalog(source));
		expect(searchFeatureCatalog(catalog.sections, 'secret')).toEqual([]);
		expect(parseFeatureCatalog('## Visible\n* Before <!-- secret -->after').sections[0].groups[0].items[0].text).toBe('Before after');
	});

	test('does not hide literal comment openers in inline code or later categories', () => {
		const catalog = parseFeatureCatalog('## A\n* HTML `<!--` example\n* Two backticks ``<!--``\n## B\n* later');
		expect(catalog.sections.map(section => section.title)).toEqual(['A', 'B']);
		expect(catalog.sections[0].groups[0].items.map(item => item.text)).toEqual(['HTML `<!--` example', 'Two backticks ``<!--``']);
	});
});

describe('fetchFeatureCatalog', () => {
	afterEach(() => vi.unstubAllGlobals());

	test('fetches and parses a standalone asset', async () => {
		const request = vi.fn().mockResolvedValue(new Response(markdown));
		vi.stubGlobal('fetch', request);
		const catalog = await fetchFeatureCatalog('/vite/assets/catalog.md', new AbortController().signal);
		expect(catalog).toEqual(parseFeatureCatalog(markdown));
		expect(request).toHaveBeenCalledWith('/vite/assets/catalog.md', { signal: expect.any(AbortSignal) });
	});

	test('rejects HTTP errors and successful HTML fallback responses', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not found', { status: 404 })));
		await expect(fetchFeatureCatalog('/missing.md', new AbortController().signal)).rejects.toThrow('404');
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Fallback</html>')));
		await expect(fetchFeatureCatalog('/missing.md', new AbortController().signal)).rejects.toThrow('no categories');
	});

	test('propagates network failures and cancellation so the page can retry or unmount', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Offline')));
		await expect(fetchFeatureCatalog('/catalog.md', new AbortController().signal)).rejects.toThrow('Offline');
		vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, { signal }) => {
			signal.throwIfAborted();
		}));
		const controller = new AbortController();
		controller.abort();
		await expect(fetchFeatureCatalog('/catalog.md', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
	});
});

describe('lintFeatureCatalog', () => {
	const rulesOf = (input: string): FeatureCatalogLintRule[] => lintFeatureCatalog(input).map(issue => issue.rule);

	test('produces zero false positives on valid catalog prose and allowed MFM', () => {
		const valid = [
			'<!--',
			'2026.11.1 /tempura-changelog 上記参照 このバージョンで',
			'-->',
			'',
			'# Misskey-Tempura 独自機能ガイド',
			'',
			'本家 Misskey にはない機能と動作の違いをまとめています。',
			'',
			'注意事項',
			'',
			'* アプリ内の /tempura-diff で同じ内容を表示します。',
			'* 記載内容は稼働中のビルドと一致します。',
			'',
			'## はじめに：主な特徴',
			'',
			'* **AI 連携**: タイムライン要約や翻訳機能を使えます。詳細は「AI・LLM・翻訳」を参照してください。',
			'',
			'## AI・LLM・翻訳',
			'',
			'### 要約と履歴',
			'',
			'ログイン済みかつ設定済みのアカウントで利用できます。',
			'',
			'* **タイムライン要約**: 直近 24 時間のノートを要約します。',
			'  * 毎日 4:30 に古い記録を自動削除します。',
			'  * メンション形式の例として `@user@host` を単一バッククォートで記載できます。',
			'  * 自動リンク化を避ける識別子は `sm9` や `CVE-2026-1234` のように単一バッククォートで囲みます。',
			'  * 絵文字 🩷 や [公式リリース](https://github.com/lqvp/misskey-tempura/releases) や https://example.com も使えます。',
		].join('\n');

		expect(lintFeatureCatalog(valid)).toEqual([]);
	});

	test('detects unsupported Markdown syntax, raw HTML, orphan children, blockquotes, plus lists and ignored notes lines', () => {
		const samples: string[] = [
			'## カテゴリ\n#### 深すぎる見出し\n* 項目です。',
			'## カテゴリ\n```ts\nconst x = 1;\n```\n* 項目です。',
			'## カテゴリ\n~~~yaml\na: 1\n~~~\n* 項目です。',
			'## カテゴリ\n| 列1 | 列2 |\n* 項目です。',
			'## カテゴリ\nON | OFF\n--- | ---\n有効 | 無効\n* 項目です。',
			'## カテゴリ\n1. 番号付き項目です。',
			'## カテゴリ\n1) 設定を開きます。',
			'## カテゴリ\n- ハイフン箇条書きです。',
			'## カテゴリ\n+ プラス箇条書きです。',
			'## カテゴリ\n> 段落位置の引用ブロックです。\n* 項目です。',
			'## カテゴリ\n*\t設定を変更できます。',
			'## カテゴリ\n*\u3000全角空白の親項目です。',
			'## カテゴリ\n* 親項目です。\n * 空白1個の子項目です。',
			'## カテゴリ\n* 親項目です。\n   * 空白3個の子項目です。',
			'## カテゴリ\n* 親項目です。\n\t* タブの子項目です。',
			'## カテゴリ\n* 親項目です。\n\u3000* 全角空白の子項目です。',
			'## カテゴリ\n  * 親項目のない孤立した子項目です。',
			'注意事項\n* 注意1です。\n  * 注意事項内の子項目です。\n## カテゴリ\n* 項目です。',
			'注意事項\nパーサーが無視する通常行です。\n* 注意1です。\n## カテゴリ\n* 項目です。',
			'注意事項\n* 注意1です。\n  管理者に連絡してください。\n## カテゴリ\n* 項目です。',
			'## カテゴリ\n---\n* 項目です。',
			'## カテゴリ\n* 説明に <br> タグが含まれます。',
			'## カテゴリ\n* 説明に <a href="https://example.com">リンク</a> が含まれます。',
		];

		for (const sample of samples) {
			expect(rulesOf(sample), sample).toContain('unsupported-syntax');
		}

		// Standalone pipes without a table delimiter row, inline code with HTML/comments, inequalities, and angle-bracket URLs must not false-positive.
		expect(rulesOf('## カテゴリ\n* 項目です。\nON | OFF\n--- | ---\n有効 | 無効')).toEqual(['unsupported-syntax']);
		expect(lintFeatureCatalog('## カテゴリ\nモードは ON | OFF から選べます。\n* 選択肢は ON | OFF です。')).toEqual([]);
		expect(lintFeatureCatalog('## カテゴリ\n* 説明に `<br>` や `<!--` を書けます。')).toEqual([]);
		expect(lintFeatureCatalog('## カテゴリ\n* 条件が a<b のとき -> c になります。')).toEqual([]);
		expect(lintFeatureCatalog('## カテゴリ\n* 公式サイトは <https://example.com> です。')).toEqual([]);
	});

	test('handles single-line and multiline code fences without skipping subsequent lines or duplicating closing errors', () => {
		const singleLineFence = [
			'## カテゴリ',
			'* 項目です。',
			'```foo```',
			'## 2026-11-26 の変更',
			'* 旧URL /tempura-changelog です。',
		].join('\n');
		expect(rulesOf(singleLineFence)).toEqual(['unsupported-syntax', 'date-section', 'legacy-url']);

		const multilineBacktick = [
			'## カテゴリ',
			'```ts',
			'const x = 1;',
			'```',
			'* 旧URL /tempura-changelog です。',
		].join('\n');
		expect(rulesOf(multilineBacktick)).toEqual(['unsupported-syntax', 'legacy-url']);

		const multilineTilde = [
			'## カテゴリ',
			'~~~yaml',
			'a: 1',
			'~~~',
			'* 項目です。',
		].join('\n');
		expect(rulesOf(multilineTilde)).toEqual(['unsupported-syntax']);

		const tildeWithInfoTilde = [
			'## カテゴリ',
			'~~~ lang~variant',
			'## 非表示',
			'~~~',
			'* 項目です。',
		].join('\n');
		expect(rulesOf(tildeWithInfoTilde)).toEqual(['unsupported-syntax']);
	});

	test('detects manual version numbers', () => {
		expect(rulesOf('## カテゴリ\n* 2026.11.1 で追加された機能です。')).toContain('manual-version');
		expect(rulesOf('## カテゴリ\n* tempura-2.0.26 以降の機能です。')).toContain('manual-version');
		expect(rulesOf('## カテゴリ\n* v2.0.25 以降の機能です。')).toContain('manual-version');
	});

	test('detects legacy /tempura-changelog URL references', () => {
		expect(rulesOf('## カテゴリ\n* アプリ内の `/tempura-changelog` を開きます。')).toContain('legacy-url');
	});

	test('detects date-based changelog headings including extra leading spaces', () => {
		expect(rulesOf('## 2026-11-26 の変更\n* 機能の説明です。')).toContain('date-section');
		expect(rulesOf('##  2026-11-26 の変更\n* 機能の説明です。')).toContain('date-section');
	});

	test('detects forbidden relative time phrases without flagging 直近', () => {
		expect(rulesOf('## カテゴリ\n* このバージョンで仕様が変わりました。')).toContain('relative-time');
		expect(rulesOf('## カテゴリ\n* この変更より前に作成した項目です。')).toContain('relative-time');
		expect(rulesOf('## カテゴリ\n* 前回のリリースから変更しました。')).toContain('relative-time');
		expect(lintFeatureCatalog('## カテゴリ\n* 直近 24 時間のノートを対象にします。')).toEqual([]);
	});

	test('detects positional references', () => {
		expect(rulesOf('## カテゴリ\n* 上記参照。')).toContain('positional-reference');
		expect(rulesOf('## カテゴリ\n* 詳細は下記参照です。')).toContain('positional-reference');
	});

	test('detects duplicate section headings and duplicate group headings within a section', () => {
		expect(rulesOf('## 検索\n* 機能1です。\n## 検索\n* 機能2です。')).toContain('duplicate-heading');
		expect(rulesOf('## 検索\n### 基本\n* 機能1です。\n### 基本\n* 機能2です。')).toContain('duplicate-heading');
		// Same ### title in different ## sections is allowed.
		expect(lintFeatureCatalog('## カテゴリA\n### 概要\n* 機能1です。\n## カテゴリB\n### 概要\n* 機能2です。')).toEqual([]);
	});

	test('detects empty documents, empty sections and empty groups', () => {
		expect(rulesOf('')).toContain('empty-section');
		expect(rulesOf('# タイトルのみ\n導入文だけです。')).toContain('empty-section');
		expect(rulesOf('## 空のカテゴリ\n## 通常カテゴリ\n* 機能です。')).toContain('empty-section');
		expect(rulesOf('## カテゴリ\n### 空の小見出し\n### 内容あり\n* 機能です。')).toContain('empty-group');
	});

	test('detects broken cross-references while allowing valid section targets', () => {
		expect(rulesOf('## はじめに\n* 詳細は「存在しないカテゴリ」を参照してください。')).toContain('broken-cross-reference');
		expect(lintFeatureCatalog('## はじめに\n* 詳細は「AI・LLM・翻訳」を参照してください。\n## AI・LLM・翻訳\n* 翻訳できます。')).toEqual([]);
	});

	test('detects multiline wrapped Japanese text in intro (including blank-line-separated paragraphs), paragraphs and items', () => {
		expect(rulesOf('導入文の1行目です。\n導入文の2行目です。\n## カテゴリ\n* 機能です。')).toContain('multiline-japanese');
		expect(rulesOf('導入文の1段落目です。\n\n導入文の2段落目です。\n## カテゴリ\n* 機能です。')).toContain('multiline-japanese');
		expect(rulesOf('## カテゴリ\n段落の1行目です。\n段落の2行目です。\n* 機能です。')).toContain('multiline-japanese');
		expect(rulesOf('## カテゴリ\n* 項目の1行目です。\n  項目の2行目です。')).toContain('multiline-japanese');
		expect(rulesOf('## カテゴリ\n* 親項目です。\n  * 子項目の1行目です。\n    子項目の2行目です。')).toContain('multiline-japanese');
	});

	test('detects ASCII-only parent and child items', () => {
		expect(rulesOf('## カテゴリ\n* WidgetWeather (Open-Meteo)')).toContain('ascii-only-item');
		expect(rulesOf('## カテゴリ\n* 親項目の説明です。\n  * always')).toContain('ascii-only-item');
	});

	test('detects more than 4 child items under a single parent', () => {
		const fiveChildren = [
			'## カテゴリ',
			'* 親項目です。',
			'  * 子項目1です。',
			'  * 子項目2です。',
			'  * 子項目3です。',
			'  * 子項目4です。',
			'  * 子項目5です。',
		].join('\n');
		expect(rulesOf(fiveChildren)).toContain('too-many-children');

		const fourChildren = [
			'## カテゴリ',
			'* 親項目です。',
			'  * 子項目1です。',
			'  * 子項目2です。',
			'  * 子項目3です。',
			'  * 子項目4です。',
		].join('\n');
		expect(lintFeatureCatalog(fourChildren)).toEqual([]);
	});

	test('detects unexpected MFM nodes, nested MFM violations, double backticks, non-HTTP(S) links and rj-number auto-links', () => {
		const badMfmSamples: string[] = [
			'## カテゴリ\n* キーワード 検索',
			'## カテゴリ\n* メンション @user@example.com の説明です。',
			'## カテゴリ\n* ハッシュタグ #tempura の説明です。',
			'## カテゴリ\n* 絵文字 :blobcat: の説明です。',
			'## カテゴリ\n* 装飾 $[tada テスト] の説明です。',
			'## カテゴリ\n* 斜体 *italic* の説明です。',
			'## カテゴリ\n* 斜体 _italic_ の説明です。',
			'## カテゴリ\n* 取消 ~~旧機能~~ の説明です。',
			'## カテゴリ\n* 小文字 <small>補足</small> の説明です。',
			'## カテゴリ\n* <center>見出し</center>',
			'## カテゴリ\n* > 引用ブロックの説明です。',
			'## カテゴリ\n* 二重バッククォート ``code`` の説明です。',
			'## カテゴリ\n* 相対リンク [独自機能](/tempura-diff) の説明です。',
			'## カテゴリ\n* 先頭スラッシュなしの相対リンク [執筆規則](docs/contributing/feature-catalog.md) の説明です。',
			'## カテゴリ\n* ニコニコ動画 sm9 の自動リンクです。',
			'## カテゴリ\n* 脆弱性 CVE-2026-1234 の自動リンクです。',
			'## カテゴリ\n* 作品番号 RJ123456 の自動リンクです。',
			'## カテゴリ\n* コミット 0123456789abcdef0123456789abcdef01234567 の自動リンクです。',
			'## カテゴリ\n* **太字の中に #tag です** の説明です。',
			'## カテゴリ\n* **太字の中に sm9** の説明です。',
			'## カテゴリ\n* [リンク内に :blobcat:](https://example.com) の説明です。',
		];

		for (const sample of badMfmSamples) {
			expect(rulesOf(sample), sample).toContain('mfm-unexpected-node');
		}

		// Inside link labels, mfm-renderer disables transformText (rj-number), so sm9 inside a link is safe.
		expect(lintFeatureCatalog('## カテゴリ\n* [リンク内に sm9](https://example.com) の説明です。')).toEqual([]);
	});

	test('detects markup and Markdown links in plain-text areas (introduction, paragraphs, notes)', () => {
		expect(rulesOf('導入文に `code` があります。\n## カテゴリ\n* 機能です。')).toContain('paragraph-markup');
		expect(rulesOf('導入文に **太字** があります。\n## カテゴリ\n* 機能です。')).toContain('paragraph-markup');
		expect(rulesOf('導入文に [リンク](https://example.com) があります。\n## カテゴリ\n* 機能です。')).toContain('paragraph-markup');
		expect(rulesOf('注意事項\n* 注意に `code` があります。\n## カテゴリ\n* 機能です。')).toContain('paragraph-markup');
		expect(rulesOf('注意事項\n* 注意に [リンク](https://example.com) があります。\n## カテゴリ\n* 機能です。')).toContain('paragraph-markup');
		expect(rulesOf('## カテゴリ\n段落に **太字** があります。\n* 機能です。')).toContain('paragraph-markup');
		expect(rulesOf('## カテゴリ\n段落に [リンク](https://example.com) があります。\n* 機能です。')).toContain('paragraph-markup');
	});

	test('detects paragraphs appearing after list items in the same group', () => {
		const input = [
			'## カテゴリ',
			'### 小見出し',
			'* 箇条書きの項目です。',
			'後から書いた段落です。',
		].join('\n');
		expect(rulesOf(input)).toContain('paragraph-after-items');
	});
});

describe('real diff.md validation', () => {
	test('enforces zero lint violations across all rules on real diff.md', () => {
		expect(lintFeatureCatalog(markdown)).toEqual([]);
	});
});
