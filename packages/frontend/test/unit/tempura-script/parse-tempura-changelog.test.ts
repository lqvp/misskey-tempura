/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { parseTempuraChangelogMarkdown } from '@/utility/tempura-script/parse-tempura-changelog.js';

describe('parseTempuraChangelogMarkdown', () => {
	test('null / undefined は空配列を返す', () => {
		expect(parseTempuraChangelogMarkdown(null)).toEqual([]);
		expect(parseTempuraChangelogMarkdown(undefined)).toEqual([]);
	});

	test('空文字は空配列を返す', () => {
		expect(parseTempuraChangelogMarkdown('')).toEqual([]);
	});

	test('バージョンヘッダーとカテゴリを解析する', () => {
		const entries = parseTempuraChangelogMarkdown([
			'# 1.9.10',
			'',
			'## Frontend',
			'* 新しいボタンを追加',
			'* レイアウトを修正',
			'',
			'### Backend',
			'* API を追加',
		].join('\n'));

		expect(entries).toHaveLength(1);
		expect(entries[0].version).toBe('1.9.10');
		expect(entries[0].context['Frontend']).toEqual(['新しいボタンを追加', 'レイアウトを修正']);
		expect(entries[0].context['Backend']).toEqual(['API を追加']);
	});

	test('Base 行は Base カテゴリに格納される', () => {
		const entries = parseTempuraChangelogMarkdown([
			'# 2.0.0',
			'Base: 2026.10.0',
			'',
			'## Frontend',
			'* 変更',
		].join('\n'));

		expect(entries[0].context['Base']).toEqual(['2026.10.0']);
		expect(entries[0].context['Frontend']).toEqual(['変更']);
	});

	test('複数のバージョンを分割する', () => {
		const entries = parseTempuraChangelogMarkdown([
			'# 1.9.9',
			'## Frontend',
			'* A',
			'',
			'# 1.9.10',
			'## Frontend',
			'* B',
		].join('\n'));

		expect(entries.map(e => e.version)).toEqual(['1.9.9', '1.9.10']);
		expect(entries[0].context['Frontend']).toEqual(['A']);
		expect(entries[1].context['Frontend']).toEqual(['B']);
	});

	test('水平線はバージョンを区切る', () => {
		const entries = parseTempuraChangelogMarkdown([
			'# 1.9.9',
			'## Frontend',
			'* A',
			'---',
			'# 1.9.10',
			'## Frontend',
			'* B',
		].join('\n'));

		expect(entries).toHaveLength(2);
	});

	test('インデントされた箇条書きは直前の項目に追記される', () => {
		const entries = parseTempuraChangelogMarkdown([
			'# 1.9.10',
			'## Frontend',
			'* 複数行の説明',
			'  続きの行',
		].join('\n'));

		expect(entries[0].context['Frontend']).toEqual(['複数行の説明\n続きの行']);
	});

	test('箇条書きでない行も項目として扱う', () => {
		const entries = parseTempuraChangelogMarkdown([
			'# 1.9.10',
			'## Frontend',
			'ただのテキスト',
		].join('\n'));

		expect(entries[0].context['Frontend']).toEqual(['ただのテキスト']);
	});

	test('空のカテゴリは削除される', () => {
		const entries = parseTempuraChangelogMarkdown([
			'# 1.9.10',
			'## Frontend',
			'',
			'## Backend',
			'* 実処理',
		].join('\n'));

		expect(entries[0].context['Frontend']).toBeUndefined();
		expect(entries[0].context['Backend']).toEqual(['実処理']);
	});

	test('項目が 1 つも無いバージョンは出力されない', () => {
		const entries = parseTempuraChangelogMarkdown([
			'# 1.9.10',
			'## Frontend',
			'',
		].join('\n'));

		expect(entries).toEqual([]);
	});

	test('CRLF の改行も扱える', () => {
		const entries = parseTempuraChangelogMarkdown([
			'# 1.9.10',
			'## Frontend',
			'* A',
		].join('\r\n'));

		expect(entries[0].version).toBe('1.9.10');
		expect(entries[0].context['Frontend']).toEqual(['A']);
	});
});
