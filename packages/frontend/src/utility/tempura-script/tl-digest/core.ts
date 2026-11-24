/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { checkWordMute } from '@/utility/check-word-mute.js';

export type TlDigestVisibility = 'public' | 'public_non_ltl' | 'home' | 'followers';

export const SELECTABLE_TL_DIGEST_VISIBILITIES: readonly TlDigestVisibility[] = [
	'public',
	'home',
	'public_non_ltl',
	'followers',
] as const;

export const DEFAULT_TL_DIGEST_VISIBILITIES: readonly TlDigestVisibility[] = [
	'public',
	'home',
] as const;

export type TlDigestCwMode = 'cwOnly' | 'exclude' | 'include';

const TL_DIGEST_CW_MODES: readonly TlDigestCwMode[] = ['cwOnly', 'exclude', 'include'];

/** ユーザー単位フィルタの種類。off: 制限なし / block: 指定ユーザーを除外 / allow: 指定ユーザーのみ対象 */
export type TlDigestUserFilterMode = 'off' | 'block' | 'allow';

const TL_DIGEST_USER_FILTER_MODES: readonly TlDigestUserFilterMode[] = ['off', 'block', 'allow'];

/** ユーザー単位フィルタで扱うユーザー数の上限 (設定 UI と保存サイズの暴走を防ぐ) */
export const MAX_TL_DIGEST_FILTER_USERS = 100;

export function normalizeTlDigestUserFilterMode(value: unknown): TlDigestUserFilterMode {
	return TL_DIGEST_USER_FILTER_MODES.includes(value as TlDigestUserFilterMode)
		? value as TlDigestUserFilterMode
		: 'off';
}

/** 保存されたユーザー ID 配列を、重複と不正値を除いた文字列配列に正規化する */
export function normalizeTlDigestFilterUserIds(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const result: string[] = [];
	for (const item of value) {
		if (typeof item !== 'string') continue;
		const id = item.trim();
		if (id === '' || seen.has(id)) continue;
		seen.add(id);
		result.push(id);
		if (result.length >= MAX_TL_DIGEST_FILTER_USERS) break;
	}
	return result;
}

export interface TlDigestFilterOptions {
	meId?: string | null;
	allowedVisibilities?: readonly string[];
	cwMode?: TlDigestCwMode;
	includeRenotes?: boolean;
	mutedWords?: Array<string | string[]>;
	hardMutedWords?: Array<string | string[]>;
	/** ユーザー単位フィルタの種類 */
	userFilterMode?: TlDigestUserFilterMode;
	/** block: 除外するユーザー / allow: このユーザーだけを対象にする */
	userFilterUserIds?: readonly string[];
	maxNoteChars?: number;
	maxPreparedNotes?: number;
}

export interface PreparedDigestNote {
	seqId: string;
	noteId: string;
	username: string;
	createdAt: string;
	line: string;
	renoteCount: number;
}

export interface TlDigestTopicRef {
	seqId: string;
	noteId: string;
	username: string;
}

export interface TlDigestTopic {
	title: string;
	summary: string;
	noteIds: string[];
	refs: TlDigestTopicRef[];
}

export interface ParsedTlDigest {
	topics: TlDigestTopic[];
	fallbackText: string | null;
}

/**
 * 許可する公開範囲リストを正規化する。
 * ダイレクト投稿 (specified) はいかなる場合も除外する。
 */
export function normalizeTlDigestVisibilities(value: unknown): TlDigestVisibility[] {
	if (!Array.isArray(value)) {
		return [...DEFAULT_TL_DIGEST_VISIBILITIES];
	}
	return value.filter((v): v is TlDigestVisibility =>
		typeof v === 'string' && (SELECTABLE_TL_DIGEST_VISIBILITIES as readonly string[]).includes(v),
	);
}

/**
 * CW の扱いを正規化する。未知の値は本文を送らない安全側 (cwOnly) に倒す。
 */
export function normalizeTlDigestCwMode(value: unknown): TlDigestCwMode {
	return typeof value === 'string' && (TL_DIGEST_CW_MODES as readonly string[]).includes(value)
		? value as TlDigestCwMode
		: 'cwOnly';
}

/**
 * フォロワー限定投稿の送信同意を適用する。
 *
 * 同意は「同意したときの送信先」と結び付けて保存しておき、現在の送信先と一致しない場合
 * (別アカウント・送信先の変更・LLM 未設定) は followers を除外する。
 */
export function applyFollowersConsent(
	visibilities: readonly TlDigestVisibility[],
	consentDestination: string | null | undefined,
	currentDestination: string | null | undefined,
): TlDigestVisibility[] {
	if (!visibilities.includes('followers')) return [...visibilities];
	if (currentDestination != null && consentDestination === currentDestination) return [...visibilities];
	return visibilities.filter((v) => v !== 'followers');
}

/**
 * API が返すノートの実効的な公開範囲を返す。
 * Tempura の NoteEntityService は public_non_ltl を
 * `{ visibility: 'public', dontShowOnLtl: true }` として返すため両方に対応する。
 */
export function getEffectiveNoteVisibility(note: Misskey.entities.Note): string {
	const rawVisibility = note.visibility as string;
	if (rawVisibility === 'public_non_ltl') {
		return 'public_non_ltl';
	}
	if (rawVisibility === 'public' && (note as { dontShowOnLtl?: boolean }).dontShowOnLtl === true) {
		return 'public_non_ltl';
	}
	return rawVisibility;
}

/**
 * 純リノート (本文・CW・添付・投票を持たない RN) かどうかを判定する
 */
export function isPureRenoteNote(note: Misskey.entities.Note): boolean {
	return (
		note.renote != null &&
		note.text == null &&
		note.cw == null &&
		(note.files == null || note.files.length === 0) &&
		note.poll == null
	);
}

function sanitizeInlineText(text: string): string {
	return text
		.replaceAll('</user_content>', '&lt;/user_content&gt;')
		.replace(/\s+/g, ' ')
		.trim();
}

function truncateText(text: string, maxChars: number): string {
	if (maxChars <= 0) return '';
	const chars = Array.from(text);
	if (chars.length <= maxChars) return text;
	return chars.slice(0, maxChars).join('') + '…';
}

// 期間が日付をまたぐ (最大24時間) ため、LLM が順序を取り違えないよう日付も含める
function formatDateTime(isoDate: string): string {
	const d = new Date(isoDate);
	if (Number.isNaN(d.getTime())) return '--/-- --:--';
	const month = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	const hours = String(d.getHours()).padStart(2, '0');
	const minutes = String(d.getMinutes()).padStart(2, '0');
	return `${month}/${day} ${hours}:${minutes}`;
}

function formatUsername(user: Misskey.entities.UserLite): string {
	return user.host ? `@${user.username}@${user.host}` : `@${user.username}`;
}

function matchesSingleNoteWordMute(
	note: Misskey.entities.Note,
	meUser: Misskey.entities.UserLite | null,
	words: Array<string | string[]>,
): boolean {
	if (words.length === 0) return false;
	if (Array.isArray(checkWordMute(note, meUser, words))) {
		return true;
	}
	// 画像キャプション (comment) と投票選択肢も含めて判定する。
	// 元の本文・CW と連結して渡すことで、本文と添付説明にまたがる複合ミュート (AND条件) も検出する
	const extraTexts = [
		...(note.files ?? []).map((f) => f.comment?.trim() ?? ''),
		...(note.poll?.choices ?? []).map((c) => c.text?.trim() ?? ''),
	].filter((c) => c !== '').join('\n');
	if (extraTexts !== '') {
		const combinedText = [note.text?.trim() ?? '', extraTexts].filter((c) => c !== '').join('\n');
		const syntheticNote = {
			...note,
			text: combinedText,
		} as Misskey.entities.Note;
		if (Array.isArray(checkWordMute(syntheticNote, meUser, words))) {
			return true;
		}
	}
	return false;
}

// ワードミュートの入力が変わらない間は、ソフト・ハードを統合した配列を同一インスタンスで使い回す。
//
// check-word-mute の keywordsCache は WeakMap で「複合フィルタ (例: ['映画', '結末']) の配列オブジェクト」を
// キーにした前処理結果をキャッシュしているため、統合配列を毎回作るとキーが毎回別人になりキャッシュが効かない。
// この関数は 1 ノートにつき最大 3 回・prepareNotesForDigest では 2 回呼ばれるので、
// 同一性が保たれているかどうかがそのままホットパスのコストになる。
// キーはソフトミュート配列そのもの (WeakMap なので破棄されれば自動で消える)。
// 既定引数の [] は呼び出しごとに新しい配列になるが、両方が空なら統合結果も空で何も作らないので影響しない。
const combinedMutedWordsCache = new WeakMap<Array<string | string[]>, {
	hardMutedWords: Array<string | string[]>;
	combined: Array<string | string[]>;
}>();

/**
 * ソフト・ハードのワードミュートをひとつの配列に統合する。
 * 同じ入力 (mutedWords と hardMutedWords の両方が同じインスタンス) に対しては同じ配列を返す。
 */
function getCombinedMutedWords(
	mutedWords: Array<string | string[]>,
	hardMutedWords: Array<string | string[]>,
): Array<string | string[]> {
	const cached = combinedMutedWordsCache.get(mutedWords);
	if (cached !== undefined && cached.hardMutedWords === hardMutedWords) {
		return cached.combined;
	}
	const combined = [...mutedWords, ...hardMutedWords];
	combinedMutedWordsCache.set(mutedWords, { hardMutedWords, combined });
	return combined;
}

/**
 * ノート本体・返信先・リノート先に対してソフト/ハード両方のワードミュートを判定する
 */
export function isNoteWordMuted(
	note: Misskey.entities.Note,
	meId: string | null | undefined,
	mutedWords: Array<string | string[]> = [],
	hardMutedWords: Array<string | string[]> = [],
): boolean {
	const allMutedWords = getCombinedMutedWords(mutedWords, hardMutedWords);
	if (allMutedWords.length === 0) return false;

	const meUser = meId ? ({ id: meId } as Misskey.entities.UserLite) : null;
	if (matchesSingleNoteWordMute(note, meUser, allMutedWords)) return true;
	if (note.reply && matchesSingleNoteWordMute(note.reply, meUser, allMutedWords)) return true;
	if (note.renote && matchesSingleNoteWordMute(note.renote, meUser, allMutedWords)) return true;

	return false;
}

interface AggregatedEntry {
	targetNote: Misskey.entities.Note;
	content: string;
	renoteCount: number;
}

/**
 * ユーザー単位フィルタの判定。
 * 純リノートは「リノートした人」と「元ノートの作者」の両方が条件を満たす必要がある
 * (許可リストに居ない人がRNした他人の投稿が混ざらないようにするため)。
 */
function isUserFilterAllowed(
	rawUserId: string,
	targetUserId: string,
	mode: Exclude<TlDigestUserFilterMode, 'off'>,
	userIds: ReadonlySet<string>,
): boolean {
	if (mode === 'block') {
		return !userIds.has(rawUserId) && !userIds.has(targetUserId);
	}
	return rawUserId === targetUserId
		? userIds.has(targetUserId)
		: userIds.has(rawUserId) && userIds.has(targetUserId);
}

/**
 * HTL のノート群をフィルタリング・集約し、LLM 入力用の行リストと連番マップを生成する
 */
export function prepareNotesForDigest(
	notes: readonly Misskey.entities.Note[],
	options: TlDigestFilterOptions = {},
): {
	prepared: PreparedDigestNote[];
	promptInput: string;
	refMap: Map<string, PreparedDigestNote>;
} {
	const allowedVisibilities = normalizeTlDigestVisibilities(options.allowedVisibilities);
	const allowedSet = new Set<string>(allowedVisibilities);
	const cwMode = normalizeTlDigestCwMode(options.cwMode);
	const includeRenotes = options.includeRenotes ?? true;
	const mutedWords = options.mutedWords ?? [];
	const hardMutedWords = options.hardMutedWords ?? [];
	const maxNoteChars = options.maxNoteChars ?? 200;
	const maxPreparedNotes = options.maxPreparedNotes ?? 100;
	const meId = options.meId ?? null;
	const userFilterMode = normalizeTlDigestUserFilterMode(options.userFilterMode);
	const userFilterIds = normalizeTlDigestFilterUserIds(options.userFilterUserIds);
	const userFilterSet = new Set(userFilterIds);
	// 許可リストが空のまま allow になっている状態は「全件除外」と区別しづらいため、
	// 既定 (制限なし) にフォールバックしてダイジェストが黙って空にならないようにする
	const effectiveUserFilterMode: TlDigestUserFilterMode =
		userFilterMode === 'off' || userFilterSet.size === 0 ? 'off' : userFilterMode;

	// 上限件数で打ち切るときに最新のノートを残すため、新しい順に処理する。
	// (同時刻のノートは入力順で後ろにあるものを新しいとみなす)
	const newestFirst = notes
		.map((note, index) => ({ note, index, time: new Date(note.createdAt).getTime() }))
		.sort((a, b) => (b.time - a.time) || (b.index - a.index))
		.map((x) => x.note);

	const aggregatedByNoteId = new Map<string, AggregatedEntry>();

	for (const rawNote of newestFirst) {
		// 自分の投稿・自分のリノートは除外
		if (meId != null && rawNote.userId === meId) {
			continue;
		}

		const pureRenote = isPureRenoteNote(rawNote);
		if (pureRenote && !includeRenotes) {
			continue;
		}

		const targetNote = pureRenote && rawNote.renote != null ? rawNote.renote : rawNote;

		// リノート元が自分の投稿の場合も除外
		if (meId != null && targetNote.userId === meId) {
			continue;
		}

		// specified (ダイレクト) は無条件で除外
		const rawVisibility = getEffectiveNoteVisibility(rawNote);
		const targetVisibility = getEffectiveNoteVisibility(targetNote);
		if (rawVisibility === 'specified' || targetVisibility === 'specified') {
			continue;
		}

		// 公開範囲チェック (純RNの場合はRN自体と元ノートの両方が許可範囲内であること)
		if (!allowedSet.has(rawVisibility) || !allowedSet.has(targetVisibility)) {
			continue;
		}

		// ワードミュートチェック (ソフト・ハード両方)
		if (
			isNoteWordMuted(rawNote, meId, mutedWords, hardMutedWords) ||
			(targetNote !== rawNote && isNoteWordMuted(targetNote, meId, mutedWords, hardMutedWords))
		) {
			continue;
		}

		// ユーザー単位フィルタ (block: 除外 / allow: この作者だけを対象)
		// 純RNは「RNした人」と「元ノートの作者」の両方で判定する
		if (effectiveUserFilterMode !== 'off' && !isUserFilterAllowed(rawNote.userId, targetNote.userId, effectiveUserFilterMode, userFilterSet)) {
			continue;
		}

		// 既に同じ元ノートが集約済みなら、純リノートのときだけ RN カウントを増やす
		// (元ノート自体が流れてきた場合は RN として数えない)
		const existing = aggregatedByNoteId.get(targetNote.id);
		if (existing != null) {
			if (pureRenote) existing.renoteCount += 1;
			continue;
		}

		if (aggregatedByNoteId.size >= maxPreparedNotes) {
			continue;
		}

		// CW の扱い (Misskey では cw === '' の無言 CW も本文を隠すため null 判定にする)
		const hasCw = targetNote.cw != null;
		if (hasCw && cwMode === 'exclude') {
			continue;
		}

		const cwText = hasCw ? sanitizeInlineText(targetNote.cw!) : '';
		let bodyText = '';
		if (hasCw && cwMode === 'cwOnly') {
			// 無言 CW は送れる注記が無いため、本文を送らずスキップ (空文字 -> 下の content === '' で除外)
			bodyText = cwText !== '' ? `[CW: ${cwText}]` : '';
		} else {
			const parts: string[] = [];
			if (hasCw && cwMode === 'include' && cwText !== '') {
				parts.push(`[CW: ${cwText}]`);
			}
			if (targetNote.text != null && targetNote.text.trim() !== '') {
				parts.push(sanitizeInlineText(targetNote.text));
			}
			if (targetNote.poll?.choices != null && targetNote.poll.choices.length > 0) {
				const choices = targetNote.poll.choices
					.map((c) => sanitizeInlineText(c.text))
					.filter((c) => c !== '')
					.join(' / ');
				if (choices !== '') {
					parts.push(`[poll: ${choices}]`);
				}
			}
			// センシティブでない添付ファイルのキャプション (alt) のみテキストとして添える
			const altComments = (targetNote.files ?? [])
				.filter((f) => !f.isSensitive && f.comment != null && f.comment.trim() !== '')
				.map((f) => sanitizeInlineText(f.comment!));
			if (altComments.length > 0) {
				parts.push(`[img: ${altComments.join('; ')}]`);
			}
			bodyText = parts.join(' ').trim();
		}

		const content = truncateText(bodyText, maxNoteChars);
		if (content === '') {
			continue;
		}

		aggregatedByNoteId.set(targetNote.id, {
			targetNote,
			content,
			renoteCount: pureRenote ? 1 : 0,
		});
	}

	const prepared: PreparedDigestNote[] = [];
	const refMap = new Map<string, PreparedDigestNote>();

	// 件数上限の選別は最新アクティビティ順 (RN時刻含む) で行い、
	// プロンプト出力時は行に表示する元投稿時刻の昇順 (古い→新しい) に揃えて連番を振る
	const chronological = [...aggregatedByNoteId.values()]
		.reverse()
		.map((entry, idx) => ({ entry, idx, time: new Date(entry.targetNote.createdAt).getTime() }))
		.sort((a, b) => (a.time - b.time) || (a.idx - b.idx))
		.map((x) => x.entry);

	let index = 0;
	for (const entry of chronological) {
		index += 1;
		const seqId = `n${index}`;
		const username = formatUsername(entry.targetNote.user);
		const time = formatDateTime(entry.targetNote.createdAt);

		const markers: string[] = [];
		if (entry.renoteCount > 1) {
			markers.push(`[RN×${entry.renoteCount}]`);
		} else if (entry.renoteCount === 1) {
			markers.push('[RN]');
		}
		if (entry.targetNote.replyId != null) {
			markers.push('[reply]');
		}
		if (!isPureRenoteNote(entry.targetNote) && entry.targetNote.renoteId != null) {
			markers.push('[quote]');
		}

		const markerSuffix = markers.length > 0 ? ` ${markers.join('')}` : '';
		const line = `${seqId} ${username} (${time})${markerSuffix}: ${entry.content}`;

		const item: PreparedDigestNote = {
			seqId,
			noteId: entry.targetNote.id,
			username,
			createdAt: entry.targetNote.createdAt,
			line,
			renoteCount: entry.renoteCount,
		};
		prepared.push(item);
		refMap.set(seqId, item);
	}

	return {
		prepared,
		promptInput: prepared.map((p) => p.line).join('\n'),
		refMap,
	};
}

/**
 * TL ダイジェスト生成用のシステムプロンプトを組み立てる
 */
export function buildTlDigestSystemInstruction(
	customPrompt?: string | null,
	systemPrompt?: string | null,
): string {
	const base = [
		'You are a timeline digest assistant for a microblogging home timeline.',
		'From the provided timeline posts, extract 3 to 5 notable or active topics.',
		'Skip greetings, single-word posts, or trivial monologue unless they form a broader trend.',
		'Do NOT invent facts, usernames, or URLs. Do NOT include any URLs or Markdown links in your output.',
		'Each input post begins with a reference ID such as "n1", "n2". For each topic, list the relevant reference IDs in "refs".',
		'Respond ONLY with a valid JSON object matching this exact schema (no markdown code fences, no extra commentary):',
		'{"topics":[{"title":"Short topic title","summary":"Concise 1-2 sentence summary","refs":["n1","n2"]}]}',
		'If there are no notable topics at all, respond with: {"topics":[]}',
	].join('\n');

	const extra = [customPrompt?.trim() ?? '', systemPrompt?.trim() ?? '']
		.filter((s) => s !== '')
		.join('\n');

	if (extra === '') {
		return base;
	}
	return `${base}\n\nAdditional user preferences (always keep the JSON response schema above):\n${extra}`;
}

function normalizeSeqRef(rawRef: unknown): string | null {
	if (typeof rawRef === 'number' && Number.isInteger(rawRef) && rawRef > 0) {
		return `n${rawRef}`;
	}
	if (typeof rawRef !== 'string') return null;
	const match = rawRef.trim().match(/^#?n?(\d+)$/i);
	if (!match) return null;
	return `n${match[1]}`;
}

function stripUrls(text: string): string {
	return text.replace(/https?:\/\/\S+/gi, '[URL]').trim();
}

/**
 * 応答本文から JSON の断片を切り出す。切り出せなかった場合は全文を返す。
 * 自由文の中に JSON が引用されている場合 (`以下が要約です: {"topics":[...]}`) に、その引用を拾うためのもの。
 */
function locateJsonCandidate(trimmed: string): string {
	const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fenceMatch && fenceMatch[1] != null) {
		return fenceMatch[1].trim();
	}
	const firstBracket = trimmed.indexOf('[');
	const lastBracket = trimmed.lastIndexOf(']');
	const firstBrace = trimmed.indexOf('{');
	const lastBrace = trimmed.lastIndexOf('}');
	// トップレベルが配列 ([{...}]) の場合は外側の [] を落とさない
	if (firstBracket !== -1 && lastBracket > firstBracket && (firstBrace === -1 || firstBracket < firstBrace)) {
		return trimmed.slice(firstBracket, lastBracket + 1);
	}
	if (firstBrace !== -1 && lastBrace > firstBrace) {
		return trimmed.slice(firstBrace, lastBrace + 1);
	}
	return trimmed;
}

/**
 * 断片が自由文の「引用」なのか、応答の「本文」なのかを、外側の文で判定する。
 *
 * - 「結果は次のとおりです: []」のように、空配列の前に置かれた導入句 (コロンなどで終わる) だけなら
 *   JSON が本文であり、空配列はモデルの「話題なし」の表明とみなす。
 * - 「設定例 [] が共有されました。」のように、空配列の**後ろ**に地の文が続く場合は、
 *   その `[]` は文中の引用で、書かれた本文こそが要約になる (Finding B)。
 */
function isQuotedFragment(trimmed: string, fragment: string): boolean {
	const index = trimmed.indexOf(fragment);
	if (index < 0) return false;
	const after = trimmed.slice(index + fragment.length).replace(/```/g, '').trim();
	// 後ろに地の文が続くなら引用
	if (after !== '') return true;
	// 前に置かれたのが導入句だけなら本文とみなす
	const before = trimmed.slice(0, index).replace(/```(?:json)?/gi, '').trim();
	return before !== '' && !/[:：]$/u.test(before);
}

/**
 * 応答全体がコードフェンス 1 つだけで構成されているか。
 * その中身は「応答そのもの」であり、外側に書かれた説明文ではない。
 *
 * summary にコード例 (` ```ts ... ``` `) を書いた正当な JSON は珍しくないため、
 * 「最初のフェンスが応答の先頭で開き、最後のフェンスが応答の末尾で閉じている」ことだけを見る。
 */
function isWholeFence(trimmed: string): boolean {
	if (!trimmed.startsWith('```')) return false;
	if (!trimmed.endsWith('```')) return false;
	// 先頭のフェンスを除いた位置以降に、末尾のフェンスが閉じていること
	return trimmed.indexOf('```', 3) <= trimmed.length - 3;
}

/**
 * 応答全体がコードフェンス 1 つだけのとき、そのフェンスの中身を返す (そうでなければ null)。
 * `locateJsonCandidate` のような非貪欲な正規表現では、中身の ``` で切れてしまうため使わない。
 */
function unwrapWholeFence(trimmed: string): string | null {
	if (!isWholeFence(trimmed)) return null;
	const openEnd = trimmed.indexOf('\n');
	if (openEnd < 0) return null;
	return trimmed.slice(openEnd + 1, trimmed.length - 3).trim();
}

/**
 * JSON として解釈できた値のうち「ダイジェストの封筒」として扱える形かどうか。
 * プリミティブ (文字列・数値・真偽値・null) は JSON.parse に成功しても封筒ではない。
 */
function isParsedStructure(value: unknown): value is Record<string, unknown> | unknown[] {
	return typeof value === 'object' && value !== null;
}

/**
 * プレーンテキスト表示用に、応答全体からコードフェンス記号だけを取り除く。
 *
 * 応答全体が JSON プリミティブだった場合 (`"要約です"` / `42` / `true` / `null`) は封筒ではないため
 * `parseTlDigestResponse` が null を返し、この関数に届くのは JSON として解析できなかった自由文だけになる。
 * それでも JSON の `null` だけは「何も書かれていない」に最も近いので、そのまま "null" と
 * 表示しないよう空文字に倒す (呼び出し側で null 扱いになる)。
 */
function cleanedWholeText(text: string): string {
	const trimmed = text.trim();
	const fenceStripped = trimmed
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/\s*```$/, '')
		.trim();
	const body = fenceStripped !== trimmed ? fenceStripped : trimmed;
	if (body === 'null') return '';
	return body;
}

/**
 * 応答全体が JSON のプリミティブ (`null` / `true` / `42` / `"要約"` / `false`) かどうか。
 *
 * プリミティブの表記をそのまま要約として表示しても意味が無い (`null` や `42` がダイジェストになる) ため、
 * 応答全体がプリミティブなら不正な応答として扱う。呼び出し側はエラー表示にし、未読の pending を残す。
 */
function isWholeBodyPrimitive(trimmed: string): boolean {
	if (!/^(?:null|true|false|-?\d|")/.test(trimmed)) return false;
	try {
		return !isParsedStructure(JSON.parse(trimmed) as unknown);
	} catch {
		// プリミティブの形で始まるが JSON として壊れている。自由文として扱う
		return false;
	}
}

/**
 * 応答全体を JSON として解析した結果。
 * `value` は解析できた場合のみ入り、`fromProse` は「自由文の中の引用から取り出した」ことを表す。
 */
interface ParsedBody {
	value: unknown;
	/** 自由文の中から取り出した断片か (応答全体が JSON として成立しているわけではない) */
	fromProse: boolean;
	/** 応答全体が JSON として成立しているか (フェンスの中身も「成立」に含める) */
	wholeBody: boolean;
	/** 解析に使った文字列 (自由文中の引用かどうかの判定に使う) */
	text: string;
}

/**
 * 応答全体を JSON として解析する。
 *
 * 1. 応答全体をそのまま解析する (summary にコードフェンスを含む正当な JSON を壊さない)
 * 2. 応答全体がコードフェンス 1 つなら、その中身を解析する
 * 3. それでも駄目なら、コードフェンスの中身や前後の説明文を落とした断片を解析する (自由文の中の引用)
 */
function parseResponseBody(trimmed: string): ParsedBody | null {
	const attempts: Array<{ text: string; fromProse: boolean; wholeBody: boolean }> = [
		{ text: trimmed, fromProse: false, wholeBody: true },
	];
	const fenceInner = unwrapWholeFence(trimmed);
	if (fenceInner != null) {
		attempts.push({ text: fenceInner, fromProse: false, wholeBody: true });
	}
	const extracted = locateJsonCandidate(trimmed);
	if (extracted !== trimmed && extracted !== fenceInner) {
		attempts.push({ text: extracted, fromProse: fenceInner == null, wholeBody: false });
	}

	for (const attempt of attempts) {
		try {
			const value = JSON.parse(attempt.text) as unknown;
			if (!isParsedStructure(value)) continue;
			return { value, fromProse: attempt.fromProse, wholeBody: attempt.wholeBody, text: attempt.text };
		} catch {
			// 次の候補を試す
		}
	}
	return null;
}

/**
 * LLM の応答テキストを解析し、実在するノートへの参照のみを解決する。
 * JSON が壊れている場合はプレーンテキスト表示へ安全にフォールバックする。
 *
 * @returns 解析結果。次の場合は「不正な応答」として null を返す (呼び出し側がエラー表示にし、
 *          未読ダイジェストの pending を残す)。
 *          - 空応答
 *          - 応答全体が JSON のプリミティブ (`null` / `true` / `42` / `"要約"`)。封筒ではないので、
 *            プリミティブの表記をそのまま要約として表示しない
 *          - 応答全体が JSON だがスキーマと異なる場合
 *          - トピックを含むはずの配列に有効な要素が 1 件も無い場合
 *
 * トピックを含む配列が空 (`[]`) のときは「話題なし」として受け入れるが、**自由文の中に紛れた
 * 空配列は採用しない** (「設定例 [] が共有されました。」の `[]` を拾うと、書かれた本文が消えたうえで
 * 未読の pending まで破棄されてしまう)。受け入れるのは、応答全体が空配列 / `{"topics":[]}` のときと、
 * 自由文中の断片でも `topics` キーを明示して空配列になっているときだけ。
 */
export function parseTlDigestResponse(
	rawText: string,
	refMap: ReadonlyMap<string, PreparedDigestNote | string>,
): ParsedTlDigest | null {
	const trimmed = rawText.trim();
	if (trimmed === '') {
		return null;
	}

	// 応答全体がプリミティブなら封筒ではない (null / true / 42 / "要約" を要約として表示しない)
	if (isWholeBodyPrimitive(trimmed)) return null;

	const body = parseResponseBody(trimmed);
	if (body != null) {
		const parsed = body.value;
		const hasTopicsKey = !Array.isArray(parsed) && 'topics' in (parsed as Record<string, unknown>);
		const rawTopics = Array.isArray(parsed)
			? parsed
			: Array.isArray((parsed as Record<string, unknown>)['topics'])
				? (parsed as { topics: unknown[] }).topics
				: null;

		if (rawTopics != null) {
			const topics: TlDigestTopic[] = [];
			for (const item of rawTopics.slice(0, 8)) {
				if (item == null || typeof item !== 'object') continue;
				const record = item as Record<string, unknown>;
				const rawTitle = typeof record['title'] === 'string' ? record['title'].trim() : '';
				const rawSummary = typeof record['summary'] === 'string' ? record['summary'].trim() : '';
				if (rawTitle === '' && rawSummary === '') continue;

				const rawRefs = Array.isArray(record['refs']) ? record['refs'] : [];
				const seenNoteIds = new Set<string>();
				const noteIds: string[] = [];
				const refs: TlDigestTopicRef[] = [];

				for (const r of rawRefs) {
					const seqId = normalizeSeqRef(r);
					if (seqId == null) continue;
					const mapped = refMap.get(seqId);
					if (mapped == null) continue;
					const noteId = typeof mapped === 'string' ? mapped : mapped.noteId;
					const username = typeof mapped === 'string' ? seqId : mapped.username;
					if (seenNoteIds.has(noteId)) continue;
					seenNoteIds.add(noteId);
					noteIds.push(noteId);
					refs.push({ seqId, noteId, username });
				}

				topics.push({
					title: stripUrls(rawTitle || 'Topic'),
					summary: stripUrls(rawSummary),
					noteIds,
					refs,
				});
			}

			// スキーマ不正な要素しか無い応答は「話題なし」ではなく不正な応答として扱う
			if (topics.length > 0 || rawTopics.length === 0) {
				// 空の topics のうち、自由文の中に紛れた `[]` は採用せずプレーンテキスト表示へ回す。
				// ただし `topics` キーを明示した断片はモデルの意思表示とみなして受け入れる
				if (topics.length === 0 && body.fromProse && !hasTopicsKey && isQuotedFragment(trimmed, body.text)) {
					const fallbackText = stripUrls(cleanedWholeText(trimmed));
					if (fallbackText !== '') {
						return { topics: [], fallbackText };
					}
				}
				return {
					topics,
					fallbackText: null,
				};
			}
			// 有効なトピックが 1 件も無い: 応答全体の JSON ならスキーマ不正、自由文の中の引用なら引用として扱う
			if (!body.fromProse || hasTopicsKey) return null;
		} else if (body.wholeBody || hasTopicsKey) {
			// 応答全体が JSON なのにスキーマと異なる場合や、topics が配列でない要約形式の断片は、
			// 自由文の救済ではなく不正な応答として扱う
			return null;
		}
	}

	// コードフェンス記号を取り除いてプレーンテキストとして返す
	const cleanedFallback = stripUrls(cleanedWholeText(trimmed));
	if (cleanedFallback === '') return null;
	return {
		topics: [],
		fallbackText: cleanedFallback,
	};
}
