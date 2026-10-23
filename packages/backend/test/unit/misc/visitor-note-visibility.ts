/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { isNoteVisibleToAnonymousVisitor } from '@/misc/visitor-note-visibility.js';

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
// CREATED_AT より後のタイムスタンプ(秒): この値より前に作られたノートは非表示
const CUTOFF_AFTER_CREATED = Math.floor(new Date('2026-02-01T00:00:00.000Z').getTime() / 1000);
// CREATED_AT より前のタイムスタンプ(秒): 非表示対象にならない
const CUTOFF_BEFORE_CREATED = Math.floor(new Date('2025-12-01T00:00:00.000Z').getTime() / 1000);

const baseArgs = {
	note: {
		visibility: 'public',
		localOnly: false,
		createdAt: CREATED_AT,
	},
	author: {
		host: null as string | null,
		requireSigninToViewContents: false,
		makeNotesHiddenBefore: null as number | null,
		makeNotesFollowersOnlyBefore: null as number | null,
	},
	profile: {
		hidePublicNotes: false,
		hideHomeNotes: false,
		hideLocalOnlyNotes: false,
	} as {
		hidePublicNotes: boolean;
		hideHomeNotes: boolean;
		hideLocalOnlyNotes: boolean;
	} | null,
	ugcVisibilityForVisitor: 'all' as 'all' | 'local' | 'none',
};

function visible(overrides: {
	note?: Partial<typeof baseArgs.note>;
	author?: Partial<typeof baseArgs.author>;
	profile?: typeof baseArgs.profile;
	ugcVisibilityForVisitor?: typeof baseArgs.ugcVisibilityForVisitor;
} = {}): boolean {
	return isNoteVisibleToAnonymousVisitor({
		note: { ...baseArgs.note, ...overrides.note },
		author: { ...baseArgs.author, ...overrides.author },
		profile: overrides.profile !== undefined ? overrides.profile : baseArgs.profile,
		ugcVisibilityForVisitor: overrides.ugcVisibilityForVisitor ?? baseArgs.ugcVisibilityForVisitor,
	});
}

describe('isNoteVisibleToAnonymousVisitor', () => {
	test('デフォルト(公開ノート・制限なし)では公開', () => {
		expect(visible()).toBe(true);
	});

	describe('サーバー設定 (ugcVisibilityForVisitor)', () => {
		test('none なら公開しない', () => {
			expect(visible({ ugcVisibilityForVisitor: 'none' })).toBe(false);
		});

		test('local ならリモートユーザーのノートは公開しない', () => {
			expect(visible({ ugcVisibilityForVisitor: 'local', author: { host: 'remote.example' } })).toBe(false);
		});

		test('local でもローカルユーザーのノートは公開する', () => {
			expect(visible({ ugcVisibilityForVisitor: 'local' })).toBe(true);
		});
	});

	test('作者が requireSigninToViewContents を有効にしている場合は公開しない', () => {
		expect(visible({ author: { requireSigninToViewContents: true } })).toBe(false);
	});

	describe('可視性', () => {
		test.each(['public', 'public_non_ltl', 'home'])('%s は公開対象', (visibility) => {
			expect(visible({ note: { visibility } })).toBe(true);
		});

		test.each(['followers', 'specified', 'hidden'])('%s は公開対象外', (visibility) => {
			expect(visible({ note: { visibility } })).toBe(false);
		});
	});

	test('localOnly ノートは公開しない', () => {
		expect(visible({ note: { localOnly: true } })).toBe(false);
	});

	test('プロフィールが取得できない場合は fail-closed で公開しない', () => {
		expect(visible({ profile: null })).toBe(false);
	});

	describe('作者の非ログイン向け非表示設定', () => {
		test('hidePublicNotes は public を隠す', () => {
			expect(visible({ profile: { ...baseArgs.profile!, hidePublicNotes: true } })).toBe(false);
		});

		test('hidePublicNotes は public_non_ltl も隠す', () => {
			expect(visible({ note: { visibility: 'public_non_ltl' }, profile: { ...baseArgs.profile!, hidePublicNotes: true } })).toBe(false);
		});

		test('hidePublicNotes は home を隠さない', () => {
			expect(visible({ note: { visibility: 'home' }, profile: { ...baseArgs.profile!, hidePublicNotes: true } })).toBe(true);
		});

		test('hideHomeNotes は home を隠す', () => {
			expect(visible({ note: { visibility: 'home' }, profile: { ...baseArgs.profile!, hideHomeNotes: true } })).toBe(false);
		});

		test('hideHomeNotes は public を隠さない', () => {
			expect(visible({ profile: { ...baseArgs.profile!, hideHomeNotes: true } })).toBe(true);
		});
	});

	describe('時限による非表示・公開範囲の縮小', () => {
		test('makeNotesHiddenBefore より前のノートは公開しない', () => {
			expect(visible({ author: { makeNotesHiddenBefore: CUTOFF_AFTER_CREATED } })).toBe(false);
		});

		test('makeNotesHiddenBefore より後のノートは公開する', () => {
			expect(visible({ author: { makeNotesHiddenBefore: CUTOFF_BEFORE_CREATED } })).toBe(true);
		});

		test.each(['public', 'home'])('makeNotesFollowersOnlyBefore より前の %s ノートは公開しない (followers 降格)', (visibility) => {
			expect(visible({ note: { visibility }, author: { makeNotesFollowersOnlyBefore: CUTOFF_AFTER_CREATED } })).toBe(false);
		});

		test('makeNotesFollowersOnlyBefore より前の public_non_ltl ノートは降格対象外なので公開する', () => {
			expect(visible({ note: { visibility: 'public_non_ltl' }, author: { makeNotesFollowersOnlyBefore: CUTOFF_AFTER_CREATED } })).toBe(true);
		});
	});
});
