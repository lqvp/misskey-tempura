/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Ref } from 'vue';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

export const defaultNoteBottomActions = [
	'reply',
	'renote',
	'quickReact',
	'react',
	'clip',
] as const;

export const noteBottomDef = {
	reply: {
		title: i18n.ts.reply,
		icon: 'ti ti-arrow-back-up',
	},
	renote: {
		title: i18n.ts.renote,
		icon: 'ti ti-repeat',
	},
	// 通常のリアクションピッカー
	react: {
		title: i18n.ts.reaction,
		icon: 'ti ti-mood-plus',
	},
	// クイックリアクション（ハートなど）
	quickReact: {
		title: i18n.ts.like,
		icon: 'ti ti-heart',
	},
	clip: {
		title: i18n.ts.clip,
		icon: 'ti ti-paperclip',
	},
	favorite: {
		title: i18n.ts.favorite,
		icon: 'ti ti-star',
	},
	delete: {
		title: i18n.ts.delete,
		icon: 'ti ti-trash',
	},
	edit: {
		title: i18n.ts.edit,
		icon: 'ti ti-edit',
	},
	copyContent: {
		title: i18n.ts.copyContent,
		icon: 'ti ti-copy',
	},
	copyLink: {
		title: i18n.ts.copyLink,
		icon: 'ti ti-link',
	},
	translate: {
		title: i18n.ts.translate,
		icon: 'ti ti-language-hiragana',
	},
	// メニューボタンは常に最後に配置
	menu: {
		title: i18n.ts.more,
		icon: 'ti ti-dots',
	},
};

// アクションの可用性チェックも更新
export function checkActionAvailability(action: string, note: Misskey.entities.Note, $i: Misskey.entities.MeDetailed | null | undefined): boolean {
	switch (action) {
		case 'reply':
			return $i != null;
		case 'react':
			return note.reactionAcceptance !== 'likeOnly' && $i != null;
		case 'quickReact':
			return $i != null;
		case 'renote':
			return ['public', 'home'].includes(note.visibility) || note.userId === $i?.id;
		case 'clip':
			return $i != null;
		case 'favorite':
			return $i != null;
		case 'delete':
		case 'edit':
			return Boolean(note.userId === $i?.id || $i?.isAdmin || $i?.isModerator);
		case 'translate':
			return Boolean($i?.policies.canUseTranslator && note.text != null);
		default:
			return true;
	}
}

/**
 * 表示されていないアクションをメニューアイテムとして取得
 */
export function getUnusedActionsForMenu(
	note: Misskey.entities.Note,
	$i: Misskey.entities.MeDetailed | null | undefined,
	currentActions: string[],
): string[] {
	// メニューアクション自体は除外
	const allActions = Object.keys(noteBottomDef).filter(action => action !== 'menu');

	// 現在表示されていないアクションをフィルタリング
	const unusedActions = allActions.filter(action => !currentActions.includes(action));

	// 利用可能なアクションのみを返す
	return unusedActions.filter(action => checkActionAvailability(action, note, $i));
}

// アクションの型定義を更新
export type NoteBottomAction = keyof typeof noteBottomDef;

// アクションハンドラーの型も更新
export type NoteActionHandler = Record<NoteBottomAction, () => void>;
