/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { shouldHideNoteByTime } from './should-hide-note-by-time.js';

/**
 * 匿名の訪問者(未ログインのWeb/API、署名なしのActivityPub取得)に対して
 * ノートを公開してよいかどうかを判定する共有述語。
 *
 * 既存の各経路が個別に実装していた判定を共通化するためのもので、
 * 判定内容は NoteEntityService.shouldHideNote(meId = null) /
 * QueryService.generateVisibilityQuery の匿名分岐 / FeedService のフィルタに揃えている。
 *
 * 署名済みのActivityPub取得やログイン済みユーザーには適用しないこと。
 */
export function isNoteVisibleToAnonymousVisitor(args: {
	note: {
		/** 'public' | 'public_non_ltl' | 'home' などの可視性 */
		visibility: string;
		localOnly: boolean;
		/** ノートの作成日時(IdService.parse(note.id).date など) */
		createdAt: Date;
	};
	author: {
		host: string | null;
		requireSigninToViewContents: boolean;
		makeNotesHiddenBefore: number | null;
		makeNotesFollowersOnlyBefore: number | null;
	};
	/** 取得できなかった場合は fail-closed で非公開にするため null を許容 */
	profile: {
		hidePublicNotes: boolean;
		hideHomeNotes: boolean;
		hideLocalOnlyNotes: boolean;
	} | null;
	ugcVisibilityForVisitor: 'all' | 'local' | 'none';
}): boolean {
	const { note, author, profile, ugcVisibilityForVisitor } = args;

	// サーバー設定によるUGCの公開範囲
	if (ugcVisibilityForVisitor === 'none') return false;
	if (ugcVisibilityForVisitor === 'local' && author.host != null) return false;

	// 作者がコンテンツのログイン必須化を設定している
	if (author.requireSigninToViewContents) return false;

	// そもそも匿名に公開される可視性ではない
	if (note.visibility !== 'public' && note.visibility !== 'public_non_ltl' && note.visibility !== 'home') return false;

	// ローカル限定ノートは匿名には公開しない
	// (NoteEntityService.shouldHideNote・FeedService と同じ扱い)
	if (note.localOnly) return false;

	// プロフィールが取得できない異常データではプライバシー設定を判定できないため非公開側に倒す
	if (profile == null) return false;

	// 作者の非ログイン向け非表示設定
	if ((note.visibility === 'public' || note.visibility === 'public_non_ltl') && profile.hidePublicNotes) return false;
	if (note.visibility === 'home' && profile.hideHomeNotes) return false;

	// 時限による非表示・公開範囲の縮小
	if (shouldHideNoteByTime(author.makeNotesHiddenBefore, note.createdAt)) return false;
	if ((note.visibility === 'public' || note.visibility === 'home') &&
		shouldHideNoteByTime(author.makeNotesFollowersOnlyBefore, note.createdAt)) {
		// followers 扱いに降格されるノートは匿名には公開しない
		// (NoteEntityService.treatVisibility と同じ対象範囲)
		return false;
	}

	return true;
}
