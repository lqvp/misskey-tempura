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
	// allow で対象ユーザーを選んでいない状態でも制限を外さない。
	// 絞り込み設定が同期漏れや操作途中で空になったときに、送信範囲を不意に広げないため。
	const effectiveUserFilterMode: TlDigestUserFilterMode = userFilterMode;

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

		// localOnly は無条件で除外。サーバー内限定の投稿を外部 LLM へ送らないため
		if (rawNote.localOnly === true || targetNote.localOnly === true) {
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
		'From the provided timeline posts, extract only genuinely notable or active topics, up to 5.',
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
 * 開き行の info string (言語・形式の識別子) として剥がしてよいトークン。
 *
 * CommonMark の info string は「開き行の残り全体」だが、モデルの実際の逸脱には
 * 開き行に中身を続けて書くものがある (` ```json {"topics":[]} ` / ` ```GPU was the main topic `)。
 * 「先頭の 1 トークンは常に info string」とみなすと、後者の `GPU` のような
 * 言語名ではない語まで捨てられ、要約の先頭が欠ける。
 *
 * 逆に「既知の言語名だけを剥がす」と、`json5` や将来の形式名が地の文として残り、
 * 要約ではなく形式名が表示されてしまう。
 *
 * そこで**位置**で判定する。開き行の残りが「空白を含まない 1 トークンだけ」なら
 * それは info string、他に語が続くなら地の文として扱う。
 * これにより ` ```json5 ` も ` ```foobar ` も剥がれ、` ```GPU was the main topic ` は残る。
 */
const FENCE_INFO_STRING_PATTERN = /^[A-Za-z][\w+#.-]*$/u;

/**
 * 同じ行に中身が続く場合でも info string として剥がしてよい、既知の言語・形式名。
 *
 * 1 トークンだけの行は {@link FENCE_INFO_STRING_PATTERN} で判定できるが、
 * ` ```ts 要約です ` のように同じ行に地の文が続く場合、`ts` は言語名なので剥がし、
 * ` ```GPU was the main topic ` の `GPU` は言語名ではないので残す必要がある。
 * この 2 つは構文では区別できないため、既知の名前だけをここに列挙する。
 * (未知の形式名は「単独の行」なら 1) で剥がれるため、`json5` のような追加は不要)
 */
const KNOWN_FENCE_LANGUAGES = new Set([
	'json', 'jsonc', 'json5', 'typescript', 'ts', 'javascript', 'js', 'markdown', 'md',
	'yaml', 'yml', 'html', 'css', 'scss', 'text', 'txt', 'plaintext', 'python', 'py',
	'xml', 'sql', 'sh', 'bash', 'shell', 'diff', 'csv',
]);

/** その文字列が JSON の封筒 (`{` / `[`) として始まるか */
function isJsonEnvelopeStart(text: string): boolean {
	const first = text.trimStart()[0];
	return first === '{' || first === '[';
}

/** 先頭の括弧断片を JSON として解析する。地の文の `[GPU]` を形式名判定に使わないため */
function parseJsonPrefix(text: string): { value: unknown } | null {
	const candidate = text.trimStart();
	if (!isJsonEnvelopeStart(candidate)) return null;
	const end = buildBracketMatchMap(candidate).get(0);
	if (end == null) return null;
	try {
		return { value: JSON.parse(candidate.slice(0, end + 1)) as unknown };
	} catch {
		return null;
	}
}

/** 先頭の括弧断片が JSON として成立するか */
function startsWithParsableJson(text: string): boolean {
	return parseJsonPrefix(text) != null;
}

/** JSON 値の中から、ダイジェストの封筒らしきオブジェクトを浅い入れ子まで探す */
function findDigestEnvelopeRecord(value: unknown, depth = 0): Record<string, unknown> | null {
	if (depth > 6) return null;
	if (Array.isArray(value)) {
		for (const item of value) {
			const found = findDigestEnvelopeRecord(item, depth + 1);
			if (found != null) return found;
		}
		return null;
	}
	if (!isRecord(value)) return null;
	if ('topics' in value) return value;
	for (const item of Object.values(value)) {
		const found = findDigestEnvelopeRecord(item, depth + 1);
		if (found != null) return found;
	}
	return null;
}

/** JSON 値がダイジェストの封筒を含むか。設定例などの unrelated JSON と区別する */
function isDigestEnvelopeShape(value: unknown): boolean {
	return findDigestEnvelopeRecord(value) != null;
}

/** 先頭の括弧断片がダイジェストの JSON として成立するか */
function startsWithParsableDigestJson(text: string): boolean {
	const parsed = parseJsonPrefix(text);
	return parsed != null && isDigestEnvelopeShape(parsed.value);
}

/**
 * コードフェンス行 (` ```` ` で始まる行) から、フェンス記号と info string を剥がす。
 *
 * info string として剥がすのは {@link FENCE_INFO_STRING_PATTERN} に一致する 1 トークンだけ。
 * それ以外の語で始まる開き行は、その語も中身の一部として残す。
 *
 * @returns フェンス記号と info string を除いた残り。フェンス行でなければ null。
 */
function stripFenceMarker(line: string, continuation = ''): string | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith('```')) return null;
	// 4 文字目 (`) はフェンス記号の一部とみなす。``` の後の空白区切りだけを info string の境界にする
	const rest = trimmed.slice(3).trim();
	if (rest === '') return '';
	// 空白の有無に関わらず「先頭の識別子トークン」と「その後ろ」に分ける
	const tokenMatch = rest.match(/^([A-Za-z][\w+#.-]*)([\s\S]*)$/u);
	if (tokenMatch == null) return rest;
	const [, token, after] = tokenMatch;
	const tail = after.trim();

	// 1) 1 トークンだけの行は info string (json5 や将来の形式名も含めて剥がす)
	if (tail === '') return '';
	// 2) トークンの後ろが実際にダイジェストの JSON として解析できるなら、トークンは形式名とみなして剥がす
	//    ( ` ```json{"topics":[]} ` のように空白が無い場合も含む。単なる配列は箇条書きの可能性があるため対象外)
	if (startsWithParsableDigestJson(tail) && FENCE_INFO_STRING_PATTERN.test(token!)) return tail;
	//    後続行を使って初めて JSON として成立する場合は、自然文の先頭語との区別が付かないため
	//    既知の形式名だけを剥がす (`GPU [` のような地の文を残す)
	const multilineJsonText = continuation === '' ? tail : `${tail}\n${continuation}`;
	if (startsWithParsableJson(multilineJsonText) && KNOWN_FENCE_LANGUAGES.has(token!.toLowerCase())) return tail;
	// 3) 既知の言語名と地の文が空白で区切られている場合だけ、言語名を剥がす
	if (/^\s/u.test(after!) && KNOWN_FENCE_LANGUAGES.has(token!.toLowerCase())) return tail;
	// 4) それ以外は地の文。トークンも中身の一部として残す
	return rest;
}

/** 閉じフェンス行からフェンス記号だけを除く。閉じ行に info string は存在しないので語句判定はしない */
function stripClosingFenceMarker(line: string): string {
	const trimmed = line.trim();
	return trimmed.startsWith('```') ? trimmed.slice(3).trim() : '';
}

/** フェンス行 (` ```` ` で始まる行) か。閉じフェンスの判定に使う */
function isFenceLine(line: string): boolean {
	return line.trim().startsWith('```');
}

/** 応答の先頭行がフェンスの開き行として妥当か (閉じフェンス ` ```` ` だけの行は開き行にしない) */
function isFenceOpenLine(line: string): boolean {
	const trimmed = line.trim();
	if (!trimmed.startsWith('```')) return false;
	// 4 文字目がバッククォートのときは閉じフェンス (````) の一部なので開き行ではない
	if (trimmed.startsWith('````')) return false;
	return true;
}

/**
 * 応答の先頭がちょうど 1 つのコードフェンスで、その最終行が閉じフェンスなら、中身を返す。
 *
 * 「フェンスで始まりフェンスで終わる」だけでは足りない。次の応答は独立したコードブロック 2 つの
 * 並びであって 1 つのフェンスの中身ではない:
 *
 * ```
 * []
 * ```
 * 要約です。今日はGPUの話でもりあがりました。
 * ```
 * (参考)
 * ```
 *
 * これを 1 つのフェンスとみなすと要約の地の文が中身として捨てられるため、開き行より後で最初に現れる
 * フェンス行が応答の最終行であることを求める。
 *
 * 中身は開き行から info string だけを剥がした残り。開き行に中身が続いていれば (` ```json {"topics":[]}`)、
 * それも中身の一部として返す。
 *
 * @returns フェンスの中身。1 つのフェンスでなければ null。
 */
function unwrapWholeFence(trimmed: string): { inner: string; closedByFence: boolean; trailingText: string } | null {
	const lines = trimmed.split('\n');

	if (lines.length === 1) {
		// 折り返しの無いフェンス (```json []```)。閉じフェンスは末尾 3 文字とみなし、
		// その手前は中身として扱う (中身と info string の境界は行内では決められない。
		// `json` が残っても、中身が JSON なら名前が付いた値として解析できる)
		if (!isFenceOpenLine(trimmed)) return null;
		if (!trimmed.endsWith('```') || trimmed.length < 6) return null;
		const inner = trimmed.slice(3, -3);
		const head = stripFenceMarker(`\`\`\`${inner}`) ?? inner.trim();
		return { inner: head, closedByFence: true, trailingText: '' };
	}

	if (lines.length === 2) {
		// 開き行 + 閉じ行だけ (中身が空) のフェンス (```json\n```)
		if (!isFenceOpenLine(lines[0] ?? '')) return null;
		const second = (lines[1] ?? '').trim();
		if (second === '```') return { inner: stripFenceMarker(lines[0] ?? '') ?? '', closedByFence: true, trailingText: '' };
		// 閉じフェンスが内容の同じ行にある (```json\n{"topics":[]}```)。閉じフェンスは行末の 3 文字
		if (!second.endsWith('```')) return null;
		// 開き行の info string の後ろに中身が続く場合は、その中身から始める。
		// 先頭行だけでは閉じない JSON もあるため、閉じフェンスを除いた行末までを判定に使う
		const tail = second.slice(0, -3).trim();
		const head = stripFenceMarker(lines[0] ?? '', tail) ?? '';
		return { inner: head === '' ? tail : `${head}\n${tail}`, closedByFence: true, trailingText: '' };
	}

	if (!isFenceOpenLine(lines[0] ?? '')) return null;
	if (!isFenceLine(lines[lines.length - 1] ?? '')) return null;
	// 開き行の次以降で最初に現れるフェンス行が最終行でなければ「フェンス 1 つ」ではない
	for (let i = 1; i < lines.length - 1; i++) {
		if (isFenceLine(lines[i] ?? '')) return null;
	}
	// 開き行からフェンス記号と info string だけを剥がし、同じ行に続く中身は残す。
	// 先頭行に `{` だけがある応答では、後続行まで含めないと JSON として成立するか判定できない
	const restLines = lines.slice(1, -1);
	const firstLine = stripFenceMarker(lines[0] ?? '', restLines.join('\n')) ?? '';
	const innerLines = firstLine === '' ? restLines : [firstLine, ...restLines];
	const lastLine = lines[lines.length - 1] ?? '';
	// 閉じ行の後ろに文言が付いた (` ``` 要約です。`) なら、フェンスはそこで閉じていない
	const closedByFence = lastLine.trim() === '```';
	return {
		inner: innerLines.join('\n').trim(),
		closedByFence,
		trailingText: closedByFence ? '' : stripClosingFenceMarker(lastLine),
	};
}

/** ダイジェスト応答として扱う本文の上限文字数。超える部分は JSON 断片の探索に使わない */
const MAX_CANDIDATE_SCAN_LENGTH = 100_000;

/** JSON 断片の探索で試す開き括弧の上限。上限に達したら以降の開き括弧は捨てて打ち切る */
const MAX_CANDIDATE_SCAN_STARTS = 1_000;

/** 解析を試す候補断片の上限。1 応答に現れる断片は数個で、上限は暴走入力の打ち切り用 */
const MAX_JSON_CANDIDATES = 128;

/**
 * 本文を前から 1 回なめて、各位置の開き括弧に対応する閉じ括弧の位置を求める。
 *
 * 位置ごとの再走査は、対応しない `[` が大量にある本文で 2 乗の時間になる
 * (16,000 個の `[` で 300ms 超)。ここでは文字列リテラルの外側の括弧だけを 1 パスで
 * スタックに積み、対応する閉じ括弧が決まった時点で開き側の位置に記録する。
 *
 * @returns 開き括弧の位置 -> 対応する閉じ括弧の位置
 */
function buildBracketMatchMap(body: string): Map<number, number> {
	const matches = new Map<number, number>();
	const openPositions: number[] = [];
	let inString = false;
	let escaped = false;

	for (let i = 0; i < body.length; i++) {
		const char = body[i]!;
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === '"') {
				inString = false;
			}
			continue;
		}
		if (char === '"') {
			inString = true;
		} else if (char === '{' || char === '[') {
			openPositions.push(i);
		} else if (char === '}' || char === ']') {
			// 対応する開き括弧が無い閉じ括弧は捨てる
			const open = openPositions.pop();
			if (open != null) matches.set(open, i);
		}
	}
	return matches;
}

/** 本文中の JSON 候補断片 1 つと、その本文内での範囲 [start, end) */
interface JsonCandidate {
	text: string;
	start: number;
	end: number;
}

/** 本文の括弧走査結果 */
interface JsonSpanScan {
	/** 出現順の候補断片（上限で打ち切る） */
	candidates: JsonCandidate[];
	/** 入れ子の内側を除いた、対応する括弧の範囲 [start, end)。外側の地の文の判定に使う */
	topLevelSpans: Array<{ start: number; end: number }>;
}

/**
 * 対応する括弧の範囲から、入れ子の内側を取り除いて外側の範囲だけを残す。
 * 開始位置の昇順に見れば、外側の範囲に完全に含まれる範囲は「開始位置 < 外側の終端」で判別できる。
 */
function collectTopLevelSpans(matches: ReadonlyMap<number, number>): Array<{ start: number; end: number }> {
	const spans: Array<{ start: number; end: number }> = [];
	let outerEnd = 0;
	for (const [start, end] of [...matches.entries()].sort((a, b) => a[0] - b[0])) {
		if (start < outerEnd) continue;
		spans.push({ start, end: end + 1 });
		outerEnd = end + 1;
	}
	return spans;
}

/**
 * 本文を 1 回なめ、JSON の候補になりうる断片を **出現順に** すべて拾う。
 *
 * 文字列リテラルの外側にある括弧だけを数えるので、値の中の ``` や括弧に惑わされない。
 * 対応する閉じ括弧が見つからない開始位置は捨てて次を探す。
 *
 * 断片を 1 つだけ返してはいけない。先頭の括弧書きが JSON でない (`[GPU]\n{"topics":[...]}`)
 * 場合に探索を止めると、後ろにある正当な封筒を取り落とすため、ここでは候補を並べて返し、
 * 採用するかどうかは呼び出し側が出現順に判定する。
 *
 * 本文長と開き括弧の試行回数には上限を設ける (ダイジェスト応答は数千文字で、超大入力は
 * モデルの暴走か別の用途を疑うべきもの)。打ち切っても通常サイズの応答の結果は変わらない。
 */
function scanJsonSpans(body: string): JsonSpanScan {
	const limit = Math.min(body.length, MAX_CANDIDATE_SCAN_LENGTH);
	const matches = buildBracketMatchMap(body.slice(0, limit));
	const candidates: JsonCandidate[] = [];
	let starts = 0;

	for (let start = 0; start < limit; start++) {
		const first = body[start];
		if (first !== '{' && first !== '[') continue;
		if (starts++ >= MAX_CANDIDATE_SCAN_STARTS) break;
		const end = matches.get(start);
		if (end == null) continue;
		candidates.push({ text: body.slice(start, end + 1), start, end: end + 1 });
		if (candidates.length >= MAX_JSON_CANDIDATES) break;
	}
	return { candidates, topLevelSpans: collectTopLevelSpans(matches) };
}

/**
 * 対応する括弧の **外側** に地の文が残っているか。
 *
 * `[GPU]` のような括弧記法は「外側の文言」に数えない。数えてしまうと、
 * 括弧書きの直後にある正当な封筒より括弧書きを優先し、要約を取り落とす。
 * バッククォートも同様に、フェンス・インラインコードの残骸なので文言と数えない。
 */
function hasOutsideProse(body: string, spans: ReadonlyArray<{ start: number; end: number }>): boolean {
	let cursor = 0;
	let outside = '';
	for (const span of spans) {
		outside += body.slice(cursor, span.start);
		cursor = span.end;
	}
	outside += body.slice(cursor);
	return /[^\s`]/u.test(outside);
}

/**
 * 断片が実際に JSON として解析できるか。
 *
 * 解析できない断片は「たまたま括弧で囲まれた地の文」(`[GPU]` など) なので、
 * 本文から取り除いてはいけない。
 */
function isParsableJson(text: string): boolean {
	try {
		JSON.parse(text);
		return true;
	} catch {
		return false;
	}
}

/**
 * 断片を本文から取り除く範囲を決める。断片に隣接する空白とバッククォート
 * (インラインコードの `やフェンスの残り) も一緒に落とし、前後の文言を 1 つの区切りでつなぐ。
 *
 * @returns 取り除く範囲 [start, end) と、前後の文言をつなぐ区切り (同じ行なら空白 1 つ、段落が分かれるなら改行)
 */
function fragmentRemoval(
	body: string,
	start: number,
	end: number,
): { start: number; end: number; separator: string } {
	let before = start;
	while (before > 0 && /[ \t`]/u.test(body[before - 1]!)) before--;
	let after = end;
	while (after < body.length && /[ \t`]/u.test(body[after]!)) after++;
	const sameLine = !body.slice(before, start).includes('\n') && !body.slice(end, after).includes('\n');
	return { start: before, end: after, separator: sameLine ? ' ' : '\n' };
}

/** プレーンテキスト表示用に、フェンス行・取り残しのフェンス記号・連続する空白を落とす */
function cleanPlainText(text: string): string {
	const cleaned = text
		.split('\n')
		.map((line, index, all) => {
			const withoutFenceMarker = line.replace(/```/g, '');
			// フェンス行の language 指定 (`json` など) だけが取り残された行は落とす。
			// 地の文に含まれるバッククォートの対 (`\`code\``) は残す
			const strayKeyword = /^\s*[A-Za-z][\w+-]*$/u.test(withoutFenceMarker)
				&& line !== withoutFenceMarker
				&& index > 0 && index < all.length - 1;
			return strayKeyword ? '' : withoutFenceMarker.trim();
		})
		.join('\n');
	return cleaned
		.replace(/[ \t]+\n/gu, '\n')
		.replace(/\n{3,}/gu, '\n\n')
		.replace(/^\n+|\n+$/gu, '')
		.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * JSON から取り出した値を「ダイジェストの封筒」として調べた結果。
 * - `{ kind: 'envelope' }`: `topics` 配列を持つ (空配列は「話題なし」)
 * - `{ kind: 'invalid' }`: `topics` を持つが配列でない、または有効なトピックが 1 件も無い = スキーマ違反
 * - `null`: 封筒ではない (JSON でない・`topics` を持たない・プリミティブ)
 */
type Envelope =
	| { kind: 'envelope'; topics: TlDigestTopic[] }
	| { kind: 'invalid' }
	| null;

/** 応答に現れた 1 トピックを、実在するノートへの参照に解決する */
function convertTopic(
	item: unknown,
	refMap: ReadonlyMap<string, PreparedDigestNote | string>,
): TlDigestTopic | null {
	if (item == null || typeof item !== 'object') return null;
	const record = item as Record<string, unknown>;
	const rawTitle = typeof record['title'] === 'string' ? record['title'].trim() : '';
	const rawSummary = typeof record['summary'] === 'string' ? record['summary'].trim() : '';
	if (rawTitle === '' && rawSummary === '') return null;

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

	return {
		title: stripUrls(rawTitle || 'Topic'),
		summary: stripUrls(rawSummary),
		noteIds,
		refs,
	};
}

/** モデルが返すトピック数の上限。プロンプトは 3〜5 件を求めており、8 件でも十分な余裕がある */
const MAX_TOPICS = 8;

/** 応答全体が JSON のプリミティブ (`null` / `true` / `42` / `"要約"`) かどうか */
function isJsonPrimitive(text: string): boolean {
	try {
		const parsed = JSON.parse(text) as unknown;
		return parsed === null || typeof parsed !== 'object';
	} catch {
		return false;
	}
}

/** JSON として解析し、封筒としての意味を調べる */
function parseEnvelope(
	text: string,
	refMap: ReadonlyMap<string, PreparedDigestNote | string>,
): Envelope {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text) as unknown;
	} catch {
		return null;
	}
	const envelopeRecord = findDigestEnvelopeRecord(parsed);
	if (envelopeRecord == null) return null;
	const rawTopics = envelopeRecord.topics;
	if (!Array.isArray(rawTopics)) return { kind: 'invalid' };

	const topics = rawTopics
		.slice(0, MAX_TOPICS)
		.map((item) => convertTopic(item, refMap))
		.filter((topic): topic is TlDigestTopic => topic != null);
	// スキーマ不正な要素しか無い応答は「話題なし」ではなく不正な応答として扱う
	if (topics.length === 0 && rawTopics.length > 0) return { kind: 'invalid' };
	return { kind: 'envelope', topics };
}

/**
 * LLM の応答テキストを解析し、実在するノートへの参照のみを解決する。
 *
 * 判定手順 (上から順に、最初に決まったところで終わる):
 *
 * 1. **正規化**: 全体を trim し、応答全体がちょうど 1 つのコードフェンスなら中身を取り出す。
 *    モデルは指示に反してフェンスを付けることが多いが、全体を包んでいるだけなら無害な逸脱として受け入れる。
 *    中身が空のフェンスは「何も書かれていない」と同じ扱い。
 * 2. **全体を JSON として解析**: プリミティブなら不正な応答 (`null`)。
 *    `topics` 配列を持つオブジェクト (封筒) ならその `topics` (空配列は「話題なし」)、
 *    スキーマ違反なら不正な応答 (`null`)。
 *    `topics` を持たないオブジェクトや配列は封筒ではないので 3 へ進む
 *    (別の JSON を引用しただけの応答を、本文を残したまま降ろせるようにするため)。
 * 3. **本文中の JSON 断片**: 出現順に調べ、封筒として成立する最初の断片の `topics` を採用する。
 *    解析できない断片 (`[GPU]` など) はそこで探索を止めず、次の断片を試す。
 *    どの断片もスキーマ違反なら不正な応答 (`null`)。
 * 4. **プレーンテキスト**: 断片 (と、断片を囲むフェンス・インラインコードの記号) を除いた残りを
 *    `fallbackText` にする。残りの文言が空なら「話題なし」(`fallbackText: null`)。
 *
 * **1 でフェンスを剥がした場合も、2〜4 は剥がした中身に対して行う。**
 * フェンスの中身を「フェンスの外側は空」とみなすと、フェンスの中に書かれた地の文が消えるため、
 * 剥がした中身をそのまま本文として扱う。
 *
 * **JSON として解析できた断片だけを取り除く。** 解析できない括弧は地の文 (`[GPU] が話題でした。`) なので、
 * 取り除かずそのまま本文に残す。
 *
 * **断片の外側に文言が残っている場合は、3 の封筒より 4 を優先する。**
 * 外側の文言が導入句 (`結果:`) か地の文かを長さや記号で推測する判定は、何度直しても取りこぼしが出た
 * (「ラーメンとGPUの話 / []」で要約が消える、「結果: `[]`」でバッククォートが漏れる)。
 * そのため推測は一切せず、「外側に空白以外の文言があるか」という 1 つの事実だけで決める。
 * ただし括弧記法そのもの (`[GPU]`) は「外側の文言」に数えない。数えると、
 * `[GPU]\n{"topics":[...]}` のように JSON の手前へ括弧書きが置かれた応答で、
 * 正当な封筒を取り落とす (これが実際に起きた不具合だった)。
 *
 * 代償として `結果: []` は「結果:」を本文として表示する (話題なし表示にはならない)。
 * それでも情報は失われず、システムプロンプトは前置きを禁じているうえ、書かれた要約を捨てる誤り
 * (未読の pending ごと破棄される) のほうがはるかに高くつくため、この側に倒す。
 *
 * @returns 解析結果。不正な応答とみなす場合は null (呼び出し側がエラー表示にし、pending を残す)。
 */
export function parseTlDigestResponse(
	rawText: string,
	refMap: ReadonlyMap<string, PreparedDigestNote | string>,
): ParsedTlDigest | null {
	const trimmed = rawText.trim();
	if (trimmed === '') return null;

	// 1. 全体を包む 1 つのフェンスだけを剥がす。以降は剥がした中身を本文として扱う
	const fence = unwrapWholeFence(trimmed);
	if (fence?.inner === '') return null;
	const body = fence?.inner ?? trimmed;

	// 1'. 閉じ行の後ろに文言が付いた (` ``` 要約です。`) 場合、フェンスは 1 つに閉じていない。
	//     中身から決めた結論に閉じ行の後ろの文言を添えて返す
	const withTrailing = (parsed: ParsedTlDigest): ParsedTlDigest => {
		if (fence == null || fence.closedByFence || fence.trailingText === '') return parsed;
		const trailing = stripUrls(cleanPlainText(fence.trailingText));
		if (trailing === '') return parsed;
		return {
			topics: parsed.topics,
			fallbackText: parsed.fallbackText == null ? trailing : `${parsed.fallbackText}\n${trailing}`,
		};
	};

	// 2. 全体を JSON として解析する。プリミティブの表記をそのまま要約として表示はしない
	if (isJsonPrimitive(body)) return null;
	const whole = parseEnvelope(body, refMap);
	if (whole?.kind === 'envelope') return withTrailing({ topics: whole.topics, fallbackText: null });
	if (whole?.kind === 'invalid') return null;

	// 3. 本文中の JSON 断片を出現順に調べ、封筒として成立する最初の断片を採用する。
	//    解析できない断片 (`[GPU]` など) はそこで探索を止めず、次の断片を試す
	const scan = scanJsonSpans(body);
	let adopted: { candidate: JsonCandidate; topics: TlDigestTopic[] } | null = null;
	let sawInvalidEnvelope = false;
	for (const candidate of scan.candidates) {
		const envelope = parseEnvelope(candidate.text, refMap);
		if (envelope?.kind === 'envelope') {
			adopted = { candidate, topics: envelope.topics };
			break;
		}
		if (envelope?.kind === 'invalid') sawInvalidEnvelope = true;
	}
	// 「topics を持つ」と表明しながら中身が壊れている応答は、本文の拾い直しも
	// 空 topics との取り違えもしない (正当な封筒が他に見つかった場合はそちらを採る)
	if (sawInvalidEnvelope && adopted == null) return null;

	// 4. 実際に JSON として解析できた断片だけを本文から除き、残りをプレーンテキストとする。
	//    解析できない断片 (`[GPU]` など) は地の文なので取り除かない。
	//    除く対象は採用した封筒。封筒が無いときは先頭の断片だけで、しかも解析できた場合に限る
	//    (壊れた JSON の内側にある断片を抜き出すと、本文が `{"topics":[ ,]}` のように崩れる)
	const first = scan.candidates[0] ?? null;
	const removalTarget = adopted?.candidate
		?? (first != null && isParsableJson(first.text) ? first : null);
	let outside = body;
	if (removalTarget != null) {
		const removal = fragmentRemoval(body, removalTarget.start, removalTarget.end);
		outside = `${body.slice(0, removal.start)}${removal.separator}${body.slice(removal.end)}`;
	}
	const fallbackText = stripUrls(cleanPlainText(outside));

	// 5. 括弧の外側に地の文が無い (`[GPU]\n{"topics":[...]}`) なら、封筒のほうが要約。
	//    括弧の外側に文言が残っている (`以下が要約です: {...}`) なら、従来どおり文言を優先する
	if (adopted != null && !hasOutsideProse(body, scan.topLevelSpans)) {
		return withTrailing({ topics: adopted.topics, fallbackText: fallbackText === '' ? null : fallbackText });
	}
	if (fallbackText !== '') return withTrailing({ topics: [], fallbackText });

	// 断片の外側に文言が残っていない: 封筒が成立していれば採用、成立していなければ「話題なし」
	return withTrailing(adopted != null
		? { topics: adopted.topics, fallbackText: null }
		: { topics: [], fallbackText: null });
}
