/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import type { InjectionKey, Ref } from 'vue';
import type { GenerateLLMOptions, LLMDestination } from '@/utility/tempura-script/llm.js';
import type { LLMResponse } from '@/utility/tempura-script/llm-response.js';
import type { TlDigestTopic, TlDigestVisibility, TlDigestCwMode } from '@/utility/tempura-script/tl-digest/core.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { prefer } from '@/preferences.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { generateLLMResponse, resolveLLMDestination } from '@/utility/tempura-script/llm.js';
import { extractLLMText } from '@/utility/tempura-script/llm-response.js';
import {
	applyFollowersConsent,
	buildTlDigestSystemInstruction,
	normalizeTlDigestCwMode,
	normalizeTlDigestFilterUserIds,
	normalizeTlDigestUserFilterMode,
	normalizeTlDigestVisibilities,
	parseTlDigestResponse,
	prepareNotesForDigest,
} from '@/utility/tempura-script/tl-digest/core.js';
import {
	dismissTlDigestPending,
	MAX_ABSENCE_WINDOW_MS,
} from '@/utility/tempura-script/tl-digest/activity.js';
import {
	measureTlDigestAsync,
	measureTlDigestSync,
} from '@/utility/tempura-script/tl-digest/metrics.js';

export interface TlDigestResult {
	topics: TlDigestTopic[];
	fallbackText: string | null;
	noteCount: number;
	/** 走査上限に達して全期間を確認できなかった場合 true */
	scanTruncated?: boolean;
	generatedAt: number;
	since: number;
	until: number;
}

export interface RunTlDigestOptions {
	since: number;
	until: number;
	maxNotes: number;
	includeRenotes: boolean;
	/** LLM へ実際に送信する直前 (確認ダイアログなどの後) に呼ばれる */
	onSending?: () => void;
}

export interface TlDigestWindow {
	since: number;
	until: number;
}

/**
 * 不在期間の対象件数の確認状態
 * - counting: 確認中
 * - ready: 確認済み (truncated は走査上限に達して全期間を確認できなかったことを表す)
 * - error: 確認に失敗した (pending は保持したまま再試行できる)
 */
export type TlDigestPendingCount =
	| { status: 'idle' }
	| { status: 'counting' }
	| { status: 'ready'; count: number; truncated: boolean }
	| { status: 'error' };

export interface TlDigestError {
	message: string;
	isConfigError: boolean;
}

export interface TlDigestTimelineParams {
	limit: number;
	untilId?: string;
	untilDate?: number;
	withRenotes: boolean;
}

/**
 * 外部依存 (API・設定・LLM) を差し替え可能にしてテストできるようにする
 */
export interface TlDigestDeps {
	fetchTimeline: (params: TlDigestTimelineParams, signal: AbortSignal) => Promise<Misskey.entities.Note[]>;
	generate: (options: GenerateLLMOptions) => Promise<LLMResponse>;
	/** @param refresh サーバー側の接続先変更を反映するためサーバー情報を取得し直す */
	resolveDestination: (refresh?: boolean) => Promise<LLMDestination | null>;
	getSettings: () => {
		visibilities: unknown;
		cwMode: unknown;
		followersConsent: string | null;
		userFilterMode: unknown;
		userFilterUserIds: unknown;
		prompt: string | null;
		systemPrompt: string | null;
		useServerApi: boolean;
	};
	getMe: () => ({ id: string } & MuteWords) | null;
	dismissPending: (userId: string | null, expectedWindow?: TlDigestWindow) => void;
	now: () => number;
}

export interface TlDigestController {
	result: Ref<TlDigestResult | null>;
	generating: Ref<boolean>;
	error: Ref<TlDigestError | null>;
	pendingCount: Ref<TlDigestPendingCount>;
	/** Storybook などから不在期間をローカル注入する場合のみ設定する */
	pendingWindow?: Ref<TlDigestWindow | null>;
	/**
	 * 不在期間の対象件数を確認する (外部 LLM への送信は行わない)
	 * @returns 確認結果。より新しい確認要求に置き換えられた場合は null
	 */
	refreshPendingCount: (win: TlDigestWindow, includeRenotes: boolean) => Promise<TlDigestPendingCount | null>;
	resetPendingCount: () => void;
	run: (options: RunTlDigestOptions) => Promise<void>;
	runRecent: (maxNotes: number, includeRenotes: boolean) => Promise<void>;
	/** 直前の期間を、現在のウィジェット設定 (件数・RN) で再生成する */
	retry: (maxNotes: number, includeRenotes: boolean) => Promise<void>;
	cancel: () => void;
	clear: () => void;
	dispose: () => void;
}

/** Storybook などから状態を差し込むための注入キー */
export const TL_DIGEST_CONTROLLER_KEY: InjectionKey<TlDigestController> = Symbol('tlDigestController');

export type TlDigestControllerStore = {
	get: (widgetId: string) => TlDigestController;
	/** 存在しなくなったウィジェットの状態を破棄する */
	prune: (widgetIds: string[]) => void;
	dispose: () => void;
};

/**
 * ウィジェット ID ごとに状態を保持するストア。
 * ネストウィジェットの切り替えで一時的にアンマウントされても生成結果や生成中の処理を失わないために使う
 */
export const TL_DIGEST_CONTROLLER_STORE_KEY: InjectionKey<TlDigestControllerStore> = Symbol('tlDigestControllerStore');

export function createTlDigestControllerStore(): TlDigestControllerStore {
	const controllers = new Map<string, TlDigestController>();
	return {
		get(widgetId) {
			let controller = controllers.get(widgetId);
			if (controller == null) {
				controller = createTlDigestController();
				controllers.set(widgetId, controller);
			}
			return controller;
		},
		prune(widgetIds) {
			const alive = new Set(widgetIds);
			for (const [id, controller] of controllers) {
				if (alive.has(id)) continue;
				controller.dispose();
				controllers.delete(id);
			}
		},
		dispose() {
			for (const controller of controllers.values()) controller.dispose();
			controllers.clear();
		},
	};
}

const API_PAGE_LIMIT = 100;
/** 1 回の確認・生成で遡るノート数の上限 (API 呼び出し回数を抑える) */
export const MAX_SCAN_NOTES = 500;
/** 件数表示の上限 (これ以上は「N件+」と表示する) */
export const PENDING_COUNT_CAP = 200;
const PREVIEW_CACHE_SIZE = 4;
/**
 * 件数確認の走査結果を再利用する有効期間。
 * 不在期間の終端 (until) は固定なので内容が古くなることはないが、
 * 削除・公開範囲変更などで件数がずれるため、長く保持しすぎない。
 */
const PREVIEW_CACHE_TTL_MS = 5 * 60 * 1000;

interface ScanResult {
	notes: Misskey.entities.Note[];
	/** 期間の先頭まで (または TL の末尾まで) 走査し終えたか */
	complete: boolean;
}

/**
 * ワードミュートの語彙 (ソフト・ハード)
 */
interface MuteWords {
	mutedWords: Array<string | string[]>;
	hardMutedWords: Array<string | string[]>;
}

/**
 * ミュート語の内容を複製して控える
 *
 * 設定が持つ配列は同じ参照のまま書き換えられることがある (リアクティブな配列への追加)。
 * 参照だけを控えると、後から書き換わった内容が「控えた時点の内容」を上書きしてしまい、
 * 送信直前の比較が常に一致してしまう。そこで要素 (AND 条件の配列) まで複製する。
 */
function snapshotMuteWords(words: MuteWords): MuteWords {
	const copy = (list: Array<string | string[]>): Array<string | string[]> =>
		list.map((entry) => Array.isArray(entry) ? [...entry] : entry);
	return { mutedWords: copy(words.mutedWords), hardMutedWords: copy(words.hardMutedWords) };
}

/**
 * ワードミュートの設定が同一かどうか。
 *
 * 文字列と文字列配列 (AND 条件) が混在するため、順序に依存しない形へ直列化して比べる。
 * 待機中にミュート語が増えた場合は、プロンプトに該当投稿が含まれている可能性があるため
 * 送信を中止する必要がある。
 */
function isSameMuteWords(a: MuteWords | null, b: MuteWords | null): boolean {
	const normalize = (value: MuteWords | null): string => {
		if (value == null) return '';
		const parts = [...value.mutedWords, '', ...value.hardMutedWords]
			.map((entry) => Array.isArray(entry) ? [...entry].sort().join('\u0000') : entry)
			.sort();
		return parts.join('\u0001');
	};
	return normalize(a) === normalize(b);
}

function isAbortError(error: unknown, signal: AbortSignal): boolean {
	return (
		signal.aborted ||
		(error instanceof Error && error.name === 'AbortError') ||
		(typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')
	);
}

const defaultDeps: TlDigestDeps = {
	fetchTimeline: (params, signal) => misskeyApi('notes/timeline', {
		...params,
		includeMyRenotes: false,
		includeRenotedMyNotes: false,
	}, undefined, signal),
	generate: (options) => generateLLMResponse(options),
	resolveDestination: (refresh) => resolveLLMDestination(refresh),
	getSettings: () => ({
		visibilities: prefer.s.tlDigestVisibilities,
		cwMode: prefer.s.tlDigestCwMode,
		followersConsent: prefer.s.tlDigestFollowersConsent,
		userFilterMode: prefer.s.tlDigestUserFilterMode,
		userFilterUserIds: prefer.s.tlDigestUserFilterUserIds,
		prompt: prefer.s.tlDigestPrompt,
		systemPrompt: prefer.s.geminiSystemPrompt,
		useServerApi: prefer.s.useGeminiLLMAPI,
	}),
	getMe: () => $i == null ? null : {
		id: $i.id,
		mutedWords: $i.mutedWords ?? [],
		hardMutedWords: $i.hardMutedWords ?? [],
	},
	dismissPending: (userId, expectedWindow) => dismissTlDigestPending(userId, expectedWindow),
	now: () => Date.now(),
};

// 自動生成済みの不在期間 (同じ期間を複数のウィジェットが重複して送信しないようページ全体で共有する)
const autoGenerateClaims = new Set<string>();

/**
 * 不在期間の自動生成を 1 回だけ実行できるよう確保する
 * @returns 確保を解放する関数 (送信前に中断した場合に呼ぶ)。既に他のウィジェットが確保済みなら null
 */
export function claimTlDigestAutoGenerate(userId: string | null, win: TlDigestWindow): (() => void) | null {
	const key = `${userId ?? ''}:${win.since}:${win.until}`;
	if (autoGenerateClaims.has(key)) return null;
	autoGenerateClaims.add(key);
	return () => {
		autoGenerateClaims.delete(key);
	};
}

export function createTlDigestController(overrides: Partial<TlDigestDeps> = {}): TlDigestController {
	const deps: TlDigestDeps = { ...defaultDeps, ...overrides };

	const result = ref<TlDigestResult | null>(null);
	const generating = ref(false);
	const error = ref<TlDigestError | null>(null);
	const pendingCount = ref<TlDigestPendingCount>({ status: 'idle' });

	let generationId = 0;
	let generationAbort: AbortController | null = null;
	let countId = 0;
	let countAbort: AbortController | null = null;
	let lastWindow: TlDigestWindow | null = null;

	// 件数確認で取得したノートを生成時に再利用する (インスタンスごと・メモリのみ・永続化しない)
	const previewCache = new Map<string, { scan: ScanResult; storedAt: number }>();

	function putPreviewCache(key: string, value: ScanResult): void {
		previewCache.delete(key);
		previewCache.set(key, { scan: value, storedAt: deps.now() });
		while (previewCache.size > PREVIEW_CACHE_SIZE) {
			const oldest = previewCache.keys().next().value;
			if (oldest == null) break;
			previewCache.delete(oldest);
		}
	}

	/** TTL を過ぎたエントリは破棄して undefined を返す */
	function getPreviewCache(key: string): ScanResult | undefined {
		const entry = previewCache.get(key);
		if (entry == null) return undefined;
		if (deps.now() - entry.storedAt > PREVIEW_CACHE_TTL_MS) {
			previewCache.delete(key);
			return undefined;
		}
		return entry.scan;
	}

	/**
	 * 送信対象の条件を確定する。
	 * followers は「同意したときの送信先」と現在の送信先が一致する場合だけ含める。
	 */
	async function resolveFilter(includeRenotes: boolean, needDestination = false, refreshDestination = false) {
		let settings = deps.getSettings();
		let me = deps.getMe();
		let visibilities: TlDigestVisibility[] = normalizeTlDigestVisibilities(settings.visibilities);
		let destination: LLMDestination | null = null;
		if (needDestination || visibilities.includes('followers')) {
			destination = await deps.resolveDestination(refreshDestination);
			// resolveDestination の待機中に設定・ミュート・同意が変わった場合に備え最新値を読み直す
			settings = deps.getSettings();
			me = deps.getMe();
			visibilities = normalizeTlDigestVisibilities(settings.visibilities);
			if (visibilities.includes('followers')) {
				visibilities = applyFollowersConsent(visibilities, settings.followersConsent, destination);
			}
		}
		const cwMode: TlDigestCwMode = normalizeTlDigestCwMode(settings.cwMode);
		// ユーザー単位フィルタは設定変更直後でも取りこぼさないよう、ここで都度正規化する
		const userFilterMode = normalizeTlDigestUserFilterMode(settings.userFilterMode);
		const userFilterUserIds = normalizeTlDigestFilterUserIds(settings.userFilterUserIds);
		return {
			settings,
			me,
			destination,
			filter: {
				meId: me?.id ?? null,
				allowedVisibilities: visibilities,
				cwMode,
				includeRenotes,
				mutedWords: me?.mutedWords ?? [],
				hardMutedWords: me?.hardMutedWords ?? [],
				userFilterMode,
				userFilterUserIds,
			},
			cacheKey: (win: TlDigestWindow) => [
				me?.id ?? '',
				win.since,
				win.until,
				includeRenotes,
				visibilities.join(','),
				cwMode,
				userFilterMode,
				userFilterUserIds.join(','),
			].join(':'),
		};
	}

	/**
	 * 指定期間の HTL ノートを新しい順から遡って取得する。
	 * `isEnough` が真になるか、期間の先頭・TL の末尾・走査上限に達したら止める。
	 */
	async function scanWindow(
		win: TlDigestWindow,
		includeRenotes: boolean,
		signal: AbortSignal,
		isEnough: (notes: Misskey.entities.Note[]) => boolean,
	): Promise<ScanResult> {
		const collected: Misskey.entities.Note[] = [];
		let untilId: string | undefined;
		let scanned = 0;

		while (scanned < MAX_SCAN_NOTES) {
			const limit = Math.min(API_PAGE_LIMIT, MAX_SCAN_NOTES - scanned);
			// untilDate は ID の時刻未満で絞り込むため、同一ミリ秒・同一秒 (objectid) のノートを
			// 取りこぼさないよう現在付近は指定せず、過去の上界は 1 秒進めてクライアント側で厳密に絞る
			const pageBoundary = untilId != null
				? { untilId }
				: (win.until < deps.now() - 1000 ? { untilDate: win.until + 1000 } : {});
			const batch = await deps.fetchTimeline({
				limit,
				...pageBoundary,
				withRenotes: includeRenotes,
			}, signal);

			if (!Array.isArray(batch) || batch.length === 0) {
				return { notes: collected, complete: true };
			}
			scanned += batch.length;

			for (const note of batch) {
				const createdMs = new Date(note.createdAt).getTime();
				if (createdMs > win.until) continue;
				if (createdMs < win.since) {
					return { notes: collected, complete: true };
				}
				collected.push(note);
			}

			if (isEnough(collected)) {
				return { notes: collected, complete: false };
			}

			const nextUntilId = batch[batch.length - 1]?.id;
			if (nextUntilId == null || nextUntilId === untilId) {
				return { notes: collected, complete: true };
			}
			untilId = nextUntilId;
		}

		return { notes: collected, complete: false };
	}

	async function refreshPendingCount(win: TlDigestWindow, includeRenotes: boolean): Promise<TlDigestPendingCount | null> {
		countAbort?.abort();
		const myId = ++countId;
		const abort = new AbortController();
		countAbort = abort;

		const isCurrent = () => myId === countId;

		pendingCount.value = { status: 'counting' };
		try {
			const { filter, cacheKey } = await resolveFilter(includeRenotes);
			if (!isCurrent()) return null;

			const countPrepared = (notes: Misskey.entities.Note[]) =>
				prepareNotesForDigest(notes, { ...filter, maxPreparedNotes: PENDING_COUNT_CAP }).prepared.length;

			// 空の allowlist は fail-close で必ず 0 件になるため、走査せず確定できる
			if (filter.userFilterMode === 'allow' && filter.userFilterUserIds.length === 0) {
				const state: TlDigestPendingCount = { status: 'ready', count: 0, truncated: false };
				pendingCount.value = state;
				return state;
			}

			const key = cacheKey(win);
			let scan = getPreviewCache(key);
			if (scan == null || (!scan.complete && countPrepared(scan.notes) < PENDING_COUNT_CAP)) {
				scan = await scanWindow(win, includeRenotes, abort.signal, (notes) => countPrepared(notes) >= PENDING_COUNT_CAP);
				if (!isCurrent()) return null;
				putPreviewCache(key, scan);
			}

			const count = countPrepared(scan.notes);
			const state: TlDigestPendingCount = {
				status: 'ready',
				count,
				truncated: !scan.complete || count >= PENDING_COUNT_CAP,
			};
			pendingCount.value = state;
			return state;
		} catch (err) {
			if (!isCurrent() || isAbortError(err, abort.signal)) return null;
			// 失敗を「0件」と区別して、pending を保持したまま再試行できるようにする
			const state: TlDigestPendingCount = { status: 'error' };
			pendingCount.value = state;
			return state;
		} finally {
			if (isCurrent()) countAbort = null;
		}
	}

	function resetPendingCount(): void {
		countAbort?.abort();
		countAbort = null;
		countId += 1;
		pendingCount.value = { status: 'idle' };
	}

	function configErrorMessage(useServerApi: boolean): string {
		return useServerApi ? i18n.ts._llm._error.serverDisabled : i18n.ts._llm._error.tokenMissing;
	}

	async function run(options: RunTlDigestOptions): Promise<void> {
		// 進行中の生成は明示的に置き換える (通信も中断する)
		generationAbort?.abort();
		const myId = ++generationId;
		const abort = new AbortController();
		generationAbort = abort;
		const isCurrent = () => myId === generationId;

		// 最初の await より前に状態を確定させ、二重起動やキャンセルのすり抜けを防ぐ
		lastWindow = { since: options.since, until: options.until };
		generating.value = true;
		error.value = null;

		try {
			const initial = await resolveFilter(options.includeRenotes, true, true);
			if (!isCurrent()) return;

			if (initial.destination == null) {
				error.value = { message: configErrorMessage(initial.settings.useServerApi), isConfigError: true };
				return;
			}

			const win = { since: options.since, until: options.until };
			// 空の allowlist は fail-close で必ず 0 件になるため、タイムライン取得と LLM 呼び出しを省略する
			if (initial.filter.userFilterMode === 'allow' && initial.filter.userFilterUserIds.length === 0) {
				result.value = {
					topics: [],
					fallbackText: null,
					noteCount: 0,
					scanTruncated: false,
					generatedAt: deps.now(),
					since: options.since,
					until: options.until,
				};
				deps.dismissPending(initial.me?.id ?? null, win);
				return;
			}

			const maxNotes = Math.max(1, Math.min(options.maxNotes, PENDING_COUNT_CAP));
			const prepareWith = (filter: typeof initial.filter, notes: Misskey.entities.Note[]) =>
				measureTlDigestSync(
					'filter',
					() => prepareNotesForDigest(notes, { ...filter, maxPreparedNotes: maxNotes }),
					notes.length,
				).value;
			const isEnoughWith = (filter: typeof initial.filter) => (notes: Misskey.entities.Note[]) =>
				prepareWith(filter, notes).prepared.length >= maxNotes;

			// followers を含む場合は、件数確認後に削除・公開範囲変更された投稿を送らないよう必ず取得し直す
			const cached = initial.filter.allowedVisibilities.includes('followers')
				? undefined
				: getPreviewCache(initial.cacheKey(win));
			let notes: Misskey.entities.Note[];
			let scanComplete: boolean;
			let usedNetwork = false;
			if (cached != null && (cached.complete || isEnoughWith(initial.filter)(cached.notes))) {
				notes = cached.notes;
				scanComplete = cached.complete;
			} else {
				usedNetwork = true;
				const scan = await measureTlDigestAsync(
					'scan',
					() => scanWindow(win, options.includeRenotes, abort.signal, isEnoughWith(initial.filter)),
				);
				if (!isCurrent()) return;
				notes = scan.notes;
				scanComplete = scan.complete;
			}

			// 取得中に公開範囲・CW・LLM 送信先が変更された場合は最新条件を必ず適用する
			let active = initial;
			if (usedNetwork) {
				const latest = await resolveFilter(options.includeRenotes, true);
				if (!isCurrent()) return;
				if (latest.destination == null) {
					error.value = { message: configErrorMessage(latest.settings.useServerApi), isConfigError: true };
					return;
				}
				const filterChanged =
					latest.destination !== initial.destination ||
					latest.filter.cwMode !== initial.filter.cwMode ||
					latest.filter.allowedVisibilities.join(',') !== initial.filter.allowedVisibilities.join(',');

				active = latest;
				if (filterChanged && !scanComplete && !isEnoughWith(latest.filter)(notes)) {
					const rescan = await scanWindow(win, options.includeRenotes, abort.signal, isEnoughWith(latest.filter));
					if (!isCurrent()) return;
					notes = rescan.notes;
					scanComplete = rescan.complete;

					const verified = await resolveFilter(options.includeRenotes, true);
					if (!isCurrent()) return;
					if (
						verified.destination == null ||
						verified.destination !== latest.destination ||
						verified.filter.cwMode !== latest.filter.cwMode ||
						verified.filter.allowedVisibilities.join(',') !== latest.filter.allowedVisibilities.join(',')
					) {
						throw new Error(i18n.ts._tlDigest.settingsChanged);
					}
					active = verified;
				}
			}

			// 送信直前の比較基準は「このプロンプトの作成に実際に使ったミュート語」でなければならない。
			// active.filter は resolveFilter の時点で読んだ値で、取得や確認を挟む間に追加された語は
			// プロンプトに反映されていない。ここで deps.getMe() を読み直すと、追加後の語を基準に
			// 「今と同じ」と判定してしまい、ミュートした投稿がプロンプトに入ったまま送信される。
			// また設定の配列は参照のまま書き換わり得るため、参照ではなく複製を控える。
			const muteAtPrepare = snapshotMuteWords(active.filter);

			const { prepared, promptInput, refMap } = prepareWith(active.filter, notes);

			if (prepared.length === 0) {
				result.value = {
					topics: [],
					fallbackText: null,
					noteCount: 0,
					scanTruncated: !scanComplete,
					generatedAt: deps.now(),
					since: options.since,
					until: options.until,
				};
				// 全期間を走査できた場合のみ、この期間と一致する pending を消化する
				if (scanComplete) {
					deps.dismissPending(active.me?.id ?? null, win);
				}
				return;
			}

			const response = await measureTlDigestAsync('generate', () => deps.generate({
				userContent: promptInput,
				systemInstruction: buildTlDigestSystemInstruction(active.settings.prompt, active.settings.systemPrompt),
				signal: abort.signal,
				expectedDestination: active.destination!,
				// 確認ダイアログ中などに別タブで公開範囲・同意・CW・ユーザー単位フィルタが変わっていたら送信しない。
				// ユーザー単位フィルタはプロンプトの中身そのものを決めるため、ここで再確認しないと
				// 「送信直前にブロックした相手のノートが入ったまま送信される」ことになる
				beforeSend: (destination, sending) => {
					const latest = deps.getSettings();
					let visibilities = normalizeTlDigestVisibilities(latest.visibilities);
					if (visibilities.includes('followers')) {
						visibilities = applyFollowersConsent(visibilities, latest.followersConsent, destination);
					}
					if (
						visibilities.join(',') !== active.filter.allowedVisibilities.join(',') ||
						normalizeTlDigestCwMode(latest.cwMode) !== active.filter.cwMode ||
						normalizeTlDigestUserFilterMode(latest.userFilterMode) !== active.filter.userFilterMode ||
						// モードが off のときは ID 一覧が対象に影響しないため、ID の増減では中止しない
						(normalizeTlDigestUserFilterMode(latest.userFilterMode) !== 'off' &&
							// 配列の順序は意味を持たないので、並べ替えてから比較する
							normalizeTlDigestFilterUserIds(latest.userFilterUserIds).sort().join(',') !==
								[...active.filter.userFilterUserIds].sort().join(',')) ||
						// 待機中にワードミュートを追加すると、該当投稿を含む作成済みプロンプトが送られてしまう
						!isSameMuteWords(muteAtPrepare, deps.getMe())
					) {
						throw new Error(i18n.ts._tlDigest.settingsChanged);
					}
					if (sending) options.onSending?.();
				},
			}), prepared.length);
			if (!isCurrent()) return;

			const parsed = parseTlDigestResponse(extractLLMText(response), refMap);
			if (parsed == null) {
				// 空応答・スキーマ不正は「話題なし」と区別してエラーにし、pending も残す
				throw new Error(i18n.ts._tlDigest.invalidResponse);
			}

			result.value = {
				topics: parsed.topics,
				fallbackText: parsed.fallbackText,
				noteCount: prepared.length,
				scanTruncated: !scanComplete,
				generatedAt: deps.now(),
				since: options.since,
				until: options.until,
			};
			deps.dismissPending(active.me?.id ?? null, win);
		} catch (err: unknown) {
			if (!isCurrent() || isAbortError(err, abort.signal)) return;
			const message = err instanceof Error ? err.message : String(err);
			// フォールバック確認ダイアログ等でのユーザーキャンセルはエラー表示にしない
			if (message === i18n.ts._llm._error.cancel) return;
			const isConfigError =
				message.includes(i18n.ts._llm._error.tokenMissing) ||
				message.includes(i18n.ts._llm._error.serverDisabled);
			error.value = { message, isConfigError };
		} finally {
			if (isCurrent()) {
				generating.value = false;
				generationAbort = null;
			}
		}
	}

	async function runRecent(maxNotes: number, includeRenotes: boolean): Promise<void> {
		const now = deps.now();
		await run({
			since: now - MAX_ABSENCE_WINDOW_MS,
			until: now,
			maxNotes,
			includeRenotes,
		});
	}

	async function retry(maxNotes: number, includeRenotes: boolean): Promise<void> {
		const win = lastWindow ?? (result.value != null ? { since: result.value.since, until: result.value.until } : null);
		if (win == null) {
			await runRecent(maxNotes, includeRenotes);
			return;
		}
		await run({ ...win, maxNotes, includeRenotes });
	}

	function cancel(): void {
		generationId += 1;
		generationAbort?.abort();
		generationAbort = null;
		generating.value = false;
	}

	function clear(): void {
		result.value = null;
		error.value = null;
	}

	function dispose(): void {
		cancel();
		resetPendingCount();
		previewCache.clear();
	}

	return {
		result,
		generating,
		error,
		pendingCount,
		refreshPendingCount,
		resetPendingCount,
		run,
		runRecent,
		retry,
		cancel,
		clear,
		dispose,
	};
}
