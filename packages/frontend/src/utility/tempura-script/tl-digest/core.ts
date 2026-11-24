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

export interface TlDigestFilterOptions {
	meId?: string | null;
	allowedVisibilities?: readonly string[];
	cwMode?: TlDigestCwMode;
	includeRenotes?: boolean;
	mutedWords?: Array<string | string[]>;
	hardMutedWords?: Array<string | string[]>;
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

/**
 * ノート本体・返信先・リノート先に対してソフト/ハード両方のワードミュートを判定する
 */
export function isNoteWordMuted(
	note: Misskey.entities.Note,
	meId: string | null | undefined,
	mutedWords: Array<string | string[]> = [],
	hardMutedWords: Array<string | string[]> = [],
): boolean {
	const allMutedWords = [...mutedWords, ...hardMutedWords];
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

function extractJsonCandidate(raw: string): string {
	const trimmed = raw.trim();
	const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fenceMatch && fenceMatch[1]) {
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
 * LLM の応答テキストを解析し、実在するノートへの参照のみを解決する。
 * JSON が壊れている場合はプレーンテキスト表示へ安全にフォールバックする。
 *
 * @returns 解析結果。空応答や、トピックを含むはずの配列に有効な要素が 1 件も無い場合は
 *          正当な「話題なし」 (`{"topics":[]}`) と区別するため null を返す
 */
export function parseTlDigestResponse(
	rawText: string,
	refMap: ReadonlyMap<string, PreparedDigestNote | string>,
): ParsedTlDigest | null {
	const trimmed = rawText.trim();
	if (trimmed === '') {
		return null;
	}

	// まず応答全体をそのまま JSON として解析する (summary 内の三連バッククォート誤抽出を防ぐ)。
	// 失敗した場合にのみコードフェンスや前後の説明文を取り除いて再解析する
	const jsonCandidates = [trimmed];
	const extracted = extractJsonCandidate(trimmed);
	if (extracted !== trimmed) {
		jsonCandidates.push(extracted);
	}

	let parsed: unknown;
	let parsedOk = false;
	for (const candidate of jsonCandidates) {
		try {
			parsed = JSON.parse(candidate) as unknown;
			parsedOk = true;
			break;
		} catch {
			// 次の候補を試す
		}
	}

	if (parsedOk) {
		const rawTopics = Array.isArray(parsed)
			? parsed
			: (parsed != null && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>)['topics']))
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
			if (topics.length === 0 && rawTopics.length > 0) {
				return null;
			}

			return {
				topics,
				fallbackText: null,
			};
		}
	}

	// コードフェンス記号を取り除いてプレーンテキストとして返す
	const cleanedFallback = stripUrls(
		trimmed
			.replace(/^```(?:json)?\s*/i, '')
			.replace(/\s*```$/, '')
			.trim(),
	);
	if (cleanedFallback === '') return null;
	return {
		topics: [],
		fallbackText: cleanedFallback,
	};
}
