/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { prefer } from '@/preferences.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { fetchInstance } from '@/instance.js';
import { generateLLMResponse } from '@/utility/tempura-script/llm.js';
import { extractLLMText } from '@/utility/tempura-script/llm-response.js';
import {
	buildTlDigestSystemInstruction,
	parseTlDigestResponse,
	prepareNotesForDigest,
} from '@/utility/tempura-script/tl-digest/core.js';
import type { TlDigestTopic } from '@/utility/tempura-script/tl-digest/core.js';
import {
	dismissTlDigestPending,
	MAX_ABSENCE_WINDOW_MS,
} from '@/utility/tempura-script/tl-digest/activity.js';

export interface TlDigestResult {
	topics: TlDigestTopic[];
	fallbackText: string | null;
	noteCount: number;
	generatedAt: number;
	since: number;
	until: number;
}

export interface RunTlDigestOptions {
	since: number;
	until: number;
	maxNotes: number;
	includeRenotes: boolean;
}

const API_PAGE_LIMIT = 100;

/**
 * モジュールレベルのリアクティブ状態。
 * SPA 内のページ遷移では保持され、リロードで破棄される（永続化しない）。
 */
export const latestDigestResult = ref<TlDigestResult | null>(null);
export const digestGenerating = ref(false);
export const digestError = ref<{ message: string; isConfigError: boolean } | null>(null);
export const pendingNoteCountRef = ref<number | null>(null);
export const pendingCountingRef = ref(false);

let currentGenerationId = 0;
let lastOptions: RunTlDigestOptions | null = null;
let previewCache: {
	key: string;
	notes: Misskey.entities.Note[];
	preparedCount: number;
} | null = null;

function buildPreviewKey(since: number, until: number, includeRenotes: boolean): string {
	const vis = (prefer.s.tlDigestVisibilities ?? []).join(',');
	const cw = prefer.s.tlDigestCwMode ?? 'cwOnly';
	return `${since}:${until}:${includeRenotes}:${vis}:${cw}`;
}

export async function isLlmConfigured(): Promise<boolean> {
	if (prefer.s.useGeminiLLMAPI) {
		try {
			const meta = await fetchInstance();
			return Boolean(meta?.serverOpenAIEnabled) || Boolean(prefer.s.openaiToken?.trim());
		} catch {
			return true;
		}
	}
	return Boolean(prefer.s.openaiToken && prefer.s.openaiToken.trim() !== '');
}

/**
 * 指定期間の HTL ノートを新しい順から遡って取得する
 */
async function fetchHtlNotesInWindow(
	since: number,
	until: number,
	maxFetchNotes: number,
	includeRenotes: boolean,
): Promise<Misskey.entities.Note[]> {
	const collected: Misskey.entities.Note[] = [];
	let untilId: string | undefined;
	const targetFetchCount = Math.min(Math.max(maxFetchNotes, API_PAGE_LIMIT), 200);

	while (collected.length < targetFetchCount) {
		const remaining = targetFetchCount - collected.length;
		const limit = Math.min(remaining, API_PAGE_LIMIT);

		const batch = await misskeyApi('notes/timeline', {
			limit,
			...(untilId != null ? { untilId } : { untilDate: until }),
			includeMyRenotes: false,
			includeRenotedMyNotes: false,
			withRenotes: includeRenotes,
		});

		if (!Array.isArray(batch) || batch.length === 0) {
			break;
		}

		let reachedBeforeSince = false;
		for (const note of batch) {
			const createdMs = new Date(note.createdAt).getTime();
			if (createdMs > until) {
				continue;
			}
			if (createdMs < since) {
				reachedBeforeSince = true;
				break;
			}
			collected.push(note);
		}

		if (reachedBeforeSince || batch.length < limit) {
			break;
		}

		untilId = batch[batch.length - 1]?.id;
		if (untilId == null) {
			break;
		}
	}

	return collected;
}

/**
 * 不在期間の新着対象ノート件数を事前確認する（外部 LLM 送信は一切行わない）。
 * 対象ノートが 0 件だった場合は pending を自動で消化済みにする。
 */
export async function peekPendingDigestCount(
	since: number,
	until: number,
	includeRenotes: boolean,
): Promise<number> {
	const key = buildPreviewKey(since, until, includeRenotes);
	if (previewCache?.key === key) {
		pendingNoteCountRef.value = previewCache.preparedCount;
		return previewCache.preparedCount;
	}

	pendingCountingRef.value = true;
	try {
		const notes = await fetchHtlNotesInWindow(since, until, API_PAGE_LIMIT, includeRenotes);
		const { prepared } = prepareNotesForDigest(notes, {
			meId: $i?.id ?? null,
			allowedVisibilities: prefer.s.tlDigestVisibilities,
			cwMode: prefer.s.tlDigestCwMode,
			includeRenotes,
			mutedWords: $i?.mutedWords ?? [],
			hardMutedWords: $i?.hardMutedWords ?? [],
			maxPreparedNotes: API_PAGE_LIMIT,
		});

		previewCache = {
			key,
			notes,
			preparedCount: prepared.length,
		};
		pendingNoteCountRef.value = prepared.length;

		if (prepared.length === 0) {
			dismissTlDigestPending($i?.id ?? null);
		}

		return prepared.length;
	} catch {
		pendingNoteCountRef.value = null;
		return 0;
	} finally {
		pendingCountingRef.value = false;
	}
}

/**
 * 指定期間の HTL ダイジェストを生成する
 */
export async function runTlDigest(options: RunTlDigestOptions): Promise<void> {
	lastOptions = options;
	digestError.value = null;

	const configured = await isLlmConfigured();
	if (!configured) {
		digestError.value = {
			message: i18n.ts._llm._error.tokenMissing,
			isConfigError: true,
		};
		return;
	}

	const genId = ++currentGenerationId;
	digestGenerating.value = true;

	try {
		const key = buildPreviewKey(options.since, options.until, options.includeRenotes);
		let rawNotes: Misskey.entities.Note[];
		if (previewCache?.key === key && options.maxNotes <= API_PAGE_LIMIT) {
			rawNotes = previewCache.notes;
		} else {
			rawNotes = await fetchHtlNotesInWindow(
				options.since,
				options.until,
				options.maxNotes,
				options.includeRenotes,
			);
		}

		if (genId !== currentGenerationId) return;

		const { prepared, promptInput, refMap } = prepareNotesForDigest(rawNotes, {
			meId: $i?.id ?? null,
			allowedVisibilities: prefer.s.tlDigestVisibilities,
			cwMode: prefer.s.tlDigestCwMode,
			includeRenotes: options.includeRenotes,
			mutedWords: $i?.mutedWords ?? [],
			hardMutedWords: $i?.hardMutedWords ?? [],
			maxPreparedNotes: options.maxNotes,
		});

		if (prepared.length === 0) {
			latestDigestResult.value = {
				topics: [],
				fallbackText: null,
				noteCount: 0,
				generatedAt: Date.now(),
				since: options.since,
				until: options.until,
			};
			dismissTlDigestPending($i?.id ?? null);
			previewCache = null;
			pendingNoteCountRef.value = null;
			return;
		}

		const systemInstruction = buildTlDigestSystemInstruction(
			prefer.s.tlDigestPrompt,
			prefer.s.geminiSystemPrompt,
		);

		const response = await generateLLMResponse({
			userContent: promptInput,
			systemInstruction,
		});

		if (genId !== currentGenerationId) return;

		const rawText = extractLLMText(response);
		const parsed = parseTlDigestResponse(rawText, refMap);

		latestDigestResult.value = {
			topics: parsed.topics,
			fallbackText: parsed.fallbackText,
			noteCount: prepared.length,
			generatedAt: Date.now(),
			since: options.since,
			until: options.until,
		};
		dismissTlDigestPending($i?.id ?? null);
		previewCache = null;
		pendingNoteCountRef.value = null;
	} catch (error: unknown) {
		if (genId !== currentGenerationId) return;
		const message = error instanceof Error ? error.message : String(error);
		const isConfigError =
			message.includes(i18n.ts._llm._error.tokenMissing) ||
			message.includes(i18n.ts._llm._error.serverDisabled);
		digestError.value = {
			message,
			isConfigError,
		};
	} finally {
		if (genId === currentGenerationId) {
			digestGenerating.value = false;
		}
	}
}

/**
 * 直近（最大24時間以内）の HTL を手動で要約する
 */
export async function runRecentTlDigest(maxNotes: number, includeRenotes: boolean): Promise<void> {
	const now = Date.now();
	await runTlDigest({
		since: now - MAX_ABSENCE_WINDOW_MS,
		until: now,
		maxNotes,
		includeRenotes,
	});
}

/**
 * 直前の条件で再試行・再生成する
 */
export async function retryLastTlDigest(fallbackMaxNotes: number, fallbackIncludeRenotes: boolean): Promise<void> {
	if (lastOptions != null) {
		await runTlDigest(lastOptions);
	} else if (latestDigestResult.value != null) {
		await runTlDigest({
			since: latestDigestResult.value.since,
			until: latestDigestResult.value.until,
			maxNotes: fallbackMaxNotes,
			includeRenotes: fallbackIncludeRenotes,
		});
	} else {
		await runRecentTlDigest(fallbackMaxNotes, fallbackIncludeRenotes);
	}
}

/**
 * 進行中の要約生成をキャンセルする
 */
export function cancelTlDigest(): void {
	currentGenerationId += 1;
	digestGenerating.value = false;
}

/**
 * 表示中の要約結果・エラーを閉じる
 */
export function clearTlDigestResult(): void {
	latestDigestResult.value = null;
	digestError.value = null;
}
