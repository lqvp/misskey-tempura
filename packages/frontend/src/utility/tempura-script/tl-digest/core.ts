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
 * JSON 断片の外側が「導入句」か「実質的な地の文」かを分けるしきい値。単位は実質文字数、
 * つまり句読点・記号・空白を除いた文字の数 (「**結果:**」と「結果」を同じ 2 文字とみなすため)。
 *
 * 実測値 (下記サンプルをそのまま計測したもの):
 *
 * | 分類 | サンプル (実質文字数) |
 * | --- | --- |
 * | 導入句 | `結果` 2 / `以上です` 4 / `以下が要約です` 7 / `次のとおりです` 7 |
 * | 導入句 | `こちらが結果です` 8 / `結果は次のとおりです` 10 / `以下をご確認ください` 10 |
 * | 導入句 | `まとめると次のとおりです` 12 / `以下にJSONを示します` 12 / `Here is the JSON` 13 |
 * | 導入句 | `Here is the result` 15 / `Analysis complete` 16 |
 * | 地の文 | `例` 1 / `設定例` 3 / `例です` 3 (いずれも終端記号なし) |
 * | 地の文 | `GPUの話題とラーメンの話題` 14 / `今夜はカレーの話が多かったです` 15 |
 * | 地の文 | `今日はラーメンの話題が中心でした` 16 / `今日はゲームの話題が多かったです` 16 |
 * | 地の文 | `今日はGPUの話でもりあがりました` 17 / `今日はTypeScriptのニュースで盛り上がりました` 27 |
 *
 * 導入句は最大 16 文字 (`Analysis complete`)、地の文は最小 1 文字 (`例`) で、終端記号の有無を除けば
 * 分布が重なるため長さだけでは分離できない。そこで判定は 2 段にする:
 * - まず「文を言い切っているか」を見る。導入句の大半はコロンで終わり言い切っていないので、ここで外れる
 * - 句点・疑問符・感嘆符で終わるものだけ長さで見分ける。`まとめると次のとおりです。` (12) のような
 *   短い定型句は導入句とし、地の文とみなす下限を {@link LEAD_IN_MAX_CHARS} (12) に置く
 *
 * 境界の根拠は実測値: 句点付きの導入句の最大は `まとめると次のとおりです。` の 12 文字で、
 * 句点付きの日本語の地の文の最小は `GPUの話題とラーメンの話題。` の 14 文字。12 < 13 <= 14 の間に
 * 境界を置くため、12 文字以下を導入句、13 文字以上を地の文とする。英語は最短の導入句
 * (`Here you go` 9 / `Here is the JSON` 13) がより長いので、同じ下限に 6 文字の余裕を足す。
 */
const LEAD_IN_MAX_CHARS = 12;

/**
 * 地の文の終わりを示す文字 (日本語の句点・終止符・疑問符・感嘆符)。
 * 導入句に付くのはコロンだけなので、これらが末尾にあれば「文を言い切った」とみなす。
 */
const SENTENCE_TERMINATOR = /[。．.!？!?．]+$/u;

/**
 * 日本語・中国語・韓国語の文字。英語だけの導入句 (`Here is the JSON:`) と、
 * 「それらしく見えるだけの英語の地の文」を取り違えないための補助的な手がかり。
 */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/u;

/** 実質文字 (句読点・記号・空白を除いた文字) だけを取り出す。`**結果:**` と `結果` を同じ 2 文字とみなすため */
function substantiveChars(text: string): string {
	return text.replace(/[\s\p{P}\p{S}]+/gu, '');
}

/**
 * JSON 断片の外側の文字列が、導入句ではなく「実質的な地の文」か。
 *
 * LLM は `結果は次のとおりです: []` のような前置きを添えることがあり、これは「話題なし」の表明として
 * 受け入れる必要がある。一方 `今日はラーメンの話題が中心でした。\n\n{"topics":[]}` は本文が地の文であり、
 * 空の `topics` に吸収させると書かれた要約ごと消えてしまう。
 *
 * 判定 (実質文字数は {@link LEAD_IN_MAX_CHARS} を参照):
 * - 空、または記号だけ (`**`) → 導入句 (内容が無い)
 * - 終端記号で終わらない → 導入句。`結果:` `以下が要約です:` `Here is the JSON:` はいずれも
 *   コロンで終わり、文を言い切っていない
 * - 終端記号で終わるが {@link LEAD_IN_MAX_CHARS} 文字以下 → 導入句。`まとめると次のとおりです。`
 * - それより長い → 地の文
 */
function hasSubstantiveProse(text: string): boolean {
	const normalized = text.trim();
	if (normalized === '') return false;
	const chars = substantiveChars(normalized);
	// 記号だけ (`**` や `---`) は内容が無い
	if (chars === '') return false;
	// 文を言い切っていない = 断片を導く前置き
	if (!SENTENCE_TERMINATOR.test(normalized)) return false;
	// 日本語の地の文は長さが短くても本文になり得るため、下限は短め (実測の導入句最大 13 より上) に置く
	const threshold = CJK.test(chars) ? LEAD_IN_MAX_CHARS : LEAD_IN_MAX_CHARS + 6;
	return Array.from(chars).length > threshold;
}

/**
 * 空の `topics` を「話題なし」として受け入れてよいか、書かれた本文を表示すべきかを判定する。
 *
 * - 応答全体が構造 (フェンス 1 つに包まれている場合も含む) なら受け入れる
 * - 断片の外側が導入句だけ、または地の文が無ければ受け入れる
 * - 断片の外側に実質的な地の文があれば、その地の文こそが要約なので受け入れない (Finding B / 後置の地の文)
 */
function acceptsEmptyTopics(
	trimmed: string,
	fragment: string,
	fromProse: boolean,
	isWholeBody: boolean,
): boolean {
	if (!fromProse && isWholeBody) return true;
	const index = trimmed.indexOf(fragment);
	if (index < 0) return true;
	const after = trimmed.slice(index + fragment.length).replace(/```/g, '').trim();
	// 後ろに地の文が続くなら、その地の文が本文 (「設定例 [] が共有されました。」)
	if (after !== '') return false;
	const before = trimmed.slice(0, index).replace(/```(?:json)?/gi, '').trim();
	return !hasSubstantiveProse(before);
}

/**
 * 応答全体がコードフェンス 1 つだけで構成されているとき、その開き行と閉じ行の位置を返す。
 *
 * 「フェンスで始まり、フェンスで終わる」だけでは足りない。次の応答は独立したコードブロック 2 つの
 * 並びであって、1 つのフェンスの中身ではない:
 *
 * ```
 * []
 * ```
 *
 * 要約です。今日はGPUの話でもりあがりました。
 *
 * ```
 * (参考)
 * ```
 *
 * これを 1 つのフェンスとみなすと、要約の地の文がフェンスの中身として捨てられ、
 * 書かれた要約が消えたうえで未読の pending まで破棄される。そのため、開き行の直後に現れる
 * **最初のフェンス行が応答の最終行**であることを求める (それより前に閉じフェンスがあれば不成立)。
 * 開き行の info string (`json` / `ts` など) は許容する。
 *
 * @returns 開き行の終端 (改行を含む) と閉じ行の先頭の位置。フェンス全体でなければ null。
 */
function findWholeFence(trimmed: string): { openEnd: number; closeStart: number } | null {
	const lines = trimmed.split('\n');
	// 開き行のフェンスは先頭行から始まり、info string に ``` を含まない
	const openLine = lines[0] ?? '';
	const openingFence = openLine.match(/^```[^`]*$/u);
	if (openingFence == null) return null;
	// 折り返しの無いフェンス (```[]```)。閉じ行も末尾に同居しているので中身は空になる
	if (lines.length === 1) {
		const single = trimmed.match(/^```[^`\n]*```$/u);
		if (single == null) return null;
		return { openEnd: trimmed.indexOf('```', 3) + 3, closeStart: trimmed.length - 3 };
	}
	// 開き行の次以降で最初に現れるフェンス行が、応答の最終行でなければ「フェンス 1 つ」ではない
	for (let i = 1; i < lines.length; i++) {
		if (!(lines[i] ?? '').trim().startsWith('```')) continue;
		if (i !== lines.length - 1) return null;
		const openEnd = trimmed.indexOf('\n') + 1;
		return { openEnd, closeStart: trimmed.length - 3 };
	}
	return null;
}

/**
 * 応答全体がコードフェンス 1 つだけのとき、そのフェンスの中身を返す (そうでなければ null)。
 * `locateJsonCandidate` のような非貪欲な正規表現では、中身の ``` で切れてしまうため使わない。
 */
function unwrapWholeFence(trimmed: string): string | null {
	const span = findWholeFence(trimmed);
	if (span == null) return null;
	return trimmed.slice(span.openEnd, span.closeStart).trim();
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
	// 中身が空のフェンス (` ```json\n``` `) は何も書かれていないのと同じ
	const wholeFence = findWholeFence(trimmed);
	if (wholeFence != null && trimmed.slice(wholeFence.openEnd, wholeFence.closeStart).trim() === '') {
		return '';
	}
	const fenceStripped = trimmed
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/\s*```$/, '')
		.trim();
	const body = fenceStripped !== trimmed ? fenceStripped : trimmed;
	if (body === 'null') return '';
	return body;
}

/**
 * 応答から、解析に使った JSON 断片だけを取り除く。
 *
 * 地の文の途中や直後に JSON が置かれている場合、単に ` /^```json/ ` や ` /```$/ ` を落とすだけでは
 * `{"topics":[]}\n```\n\n今日は…` のように断片の**末尾側**が地の文に残ってしまう。
 * 表示する本文は地の文そのものなので、断片と、断片を囲っていたフェンス記号だけを取り除く。
 */
function textWithoutFragment(text: string, fragment: string | null): string {
	if (fragment == null || fragment === '') return text;
	const index = text.indexOf(fragment);
	if (index < 0) return text;

	const rawBefore = text.slice(0, index);
	const rawAfter = text.slice(index + fragment.length);
	// 断片がフェンスで始まっていた場合は、その閉じフェンス行も断片の一部として落とす
	const after = fragment.startsWith('```') ? rawAfter.replace(/^[ \t]*```[^\n]*/u, '') : rawAfter;
	// `[]` と `{"topics":[]}` はどちらも「何も無い」の表明なので、文中で `[]` を引用しているだけの地の文も
	// 同じ表明として落とす (「結果は次のとおりです: []」と扱いを揃えるため)
	const withoutEmptyArray = rawBefore.replace(/[ \t]*\[\s*\][ \t]*$/u, ' ');

	// 元の地の文の区切りを復元する。改行を挟んでいたなら改行、同じ行で文が続いていたなら空白 1 つ
	const hadLineBreak = /\n\s*$/u.test(rawBefore) || /^\s*\n/u.test(after);
	const separator = hadLineBreak ? '\n' : ' ';
	const joined = `${withoutEmptyArray.replace(/[ \t]+$/u, '')}${separator}${after.replace(/^[ \t]+/u, '')}`;
	return hadLineBreak ? joined.replace(/^\n+|[ \t]+\n/gu, '').trimEnd() : joined.trim();
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
 * トピックを含む配列が空 (`[]`) のときは「話題なし」として受け入れるが、**断片の外側に実質的な地の文が
 * ある場合は採用しない** (「設定例 [] が共有されました。」や「今日はラーメンの話題が中心でした。{"topics":[]}」の
 * 空配列を拾うと、書かれた本文が消えたうえで未読の pending まで破棄されてしまう)。受け入れるのは、
 * 応答全体が空配列 / `{"topics":[]}` のとき (フェンス 1 つに包まれている場合も含む) と、
 * 断片の外側が導入句だけ、または地の文が無いときだけ。導入句と地の文の区別は
 * {@link hasSubstantiveProse} を参照。
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
				// 空の topics であっても、断片の外側に実質的な地の文があれば、その地の文こそが要約。
				// 空 topics を優先すると書かれた要約が消えたうえで未読の pending まで破棄されてしまう
				if (topics.length === 0 && !acceptsEmptyTopics(trimmed, body.text, body.fromProse, body.wholeBody)) {
					const withoutFrag = textWithoutFragment(trimmed, body.text);
					const fallbackText = stripUrls(cleanedWholeText(withoutFrag));
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
