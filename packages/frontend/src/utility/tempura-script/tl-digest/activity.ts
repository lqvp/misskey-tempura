/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';
import { miLocalStorage } from '@/local-storage.js';

export interface TlDigestStoredState {
	lastSeenAt: number;
	pendingSince: number | null;
	pendingUntil: number | null;
}

/** 記録対象とする最小の離席時間 (30分: ウィジェットの最小閾値と一致) */
export const MIN_TRACKED_ABSENCE_MS = 30 * 60 * 1000;

/** 未読期間の最大遡及時間 (24時間) */
export const MAX_ABSENCE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 前回の pending を未消化のまま再度すぐ閉じたとみなす猶予時間 (5分) */
const MERGE_PENDING_GRACE_MS = 5 * 60 * 1000;

/** アクティブ時の最終閲覧時刻更新間隔 (1分) */
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

export const pendingSinceRef = ref<number | null>(null);
export const pendingUntilRef = ref<number | null>(null);

let activeUserId: string | null = null;
let heartbeatTimer: number | null = null;
let initialized = false;

function storageKey(userId: string): `tlDigestState:${string}` {
	return `tlDigestState:${userId}`;
}

export function loadTlDigestStoredState(userId: string): TlDigestStoredState | null {
	try {
		const raw = miLocalStorage.getItem(storageKey(userId));
		if (raw == null) return null;
		const parsed = JSON.parse(raw) as Partial<TlDigestStoredState>;
		if (typeof parsed.lastSeenAt !== 'number' || !Number.isFinite(parsed.lastSeenAt)) {
			return null;
		}
		return {
			lastSeenAt: parsed.lastSeenAt,
			pendingSince: typeof parsed.pendingSince === 'number' && Number.isFinite(parsed.pendingSince) ? parsed.pendingSince : null,
			pendingUntil: typeof parsed.pendingUntil === 'number' && Number.isFinite(parsed.pendingUntil) ? parsed.pendingUntil : null,
		};
	} catch {
		return null;
	}
}

function saveTlDigestStoredState(userId: string, state: TlDigestStoredState): void {
	try {
		miLocalStorage.setItem(storageKey(userId), JSON.stringify(state));
	} catch {
		// localStorage 書き込み失敗時は無視
	}
	pendingSinceRef.value = state.pendingSince;
	pendingUntilRef.value = state.pendingUntil;
}

/**
 * 復帰・起動・定期チェック時に離席ギャップを評価し、`lastSeenAt` を更新する
 */
export function evaluateTlDigestActivity(userId: string, now = Date.now()): TlDigestStoredState {
	const existing = loadTlDigestStoredState(userId);
	if (existing == null) {
		const initial: TlDigestStoredState = {
			lastSeenAt: now,
			pendingSince: null,
			pendingUntil: null,
		};
		saveTlDigestStoredState(userId, initial);
		return initial;
	}

	const gap = now - existing.lastSeenAt;
	let pendingSince = existing.pendingSince;
	let pendingUntil = existing.pendingUntil;

	if (gap >= MIN_TRACKED_ABSENCE_MS) {
		const earliestAllowed = now - MAX_ABSENCE_WINDOW_MS;
		// 前回の pending が未消化のまま短時間で再び離席した場合は開始時刻を引き継ぐ
		const canMergePrevious =
			pendingSince != null &&
			pendingUntil != null &&
			existing.lastSeenAt - pendingUntil <= MERGE_PENDING_GRACE_MS;

		const candidateSince = canMergePrevious && pendingSince != null
			? Math.min(pendingSince, existing.lastSeenAt)
			: existing.lastSeenAt;

		pendingSince = Math.max(earliestAllowed, candidateSince);
		pendingUntil = now;
	}

	const next: TlDigestStoredState = {
		lastSeenAt: now,
		pendingSince,
		pendingUntil,
	};
	saveTlDigestStoredState(userId, next);
	return next;
}

/**
 * タブ非表示に移行した時点の `lastSeenAt` を記録する
 */
export function touchTlDigestLastSeen(userId: string, now = Date.now()): void {
	const existing = loadTlDigestStoredState(userId);
	// 別タブで pending が消化されて null になった状態を復活させないよう、existing の有無で判定する
	const next: TlDigestStoredState = {
		lastSeenAt: now,
		pendingSince: existing != null ? existing.pendingSince : pendingSinceRef.value,
		pendingUntil: existing != null ? existing.pendingUntil : pendingUntilRef.value,
	};
	saveTlDigestStoredState(userId, next);
}

/**
 * 未読期間のお知らせを消化済み（まとめる実行 or 閉じる）にする
 */
export function dismissTlDigestPending(userId: string | null = activeUserId, now = Date.now()): void {
	pendingSinceRef.value = null;
	pendingUntilRef.value = null;
	if (userId == null) return;
	const existing = loadTlDigestStoredState(userId);
	saveTlDigestStoredState(userId, {
		lastSeenAt: existing?.lastSeenAt ?? now,
		pendingSince: null,
		pendingUntil: null,
	});
}

/**
 * 指定された不在閾値（分）を満たす pending ウィンドウがあれば返す
 */
export function getActivePendingWindow(thresholdMinutes: number): { since: number; until: number } | null {
	const since = pendingSinceRef.value;
	const until = pendingUntilRef.value;
	if (since == null || until == null || until <= since) return null;
	const thresholdMs = Math.max(1, thresholdMinutes) * 60 * 1000;
	if (until - since < thresholdMs) return null;
	return { since, until };
}

/**
 * グローバルな離席トラッキングを開始する (`mainBoot()` から 1 回呼ぶ)
 */
export function initTlDigestActivity(userId: string): void {
	activeUserId = userId;
	evaluateTlDigestActivity(userId);

	if (initialized || typeof window === 'undefined') return;
	initialized = true;

	window.document.addEventListener('visibilitychange', () => {
		if (activeUserId == null) return;
		if (window.document.visibilityState === 'visible') {
			evaluateTlDigestActivity(activeUserId);
		} else {
			touchTlDigestLastSeen(activeUserId);
		}
	});

	window.addEventListener('pagehide', () => {
		if (activeUserId == null) return;
		// 非表示のまま閉じた場合は、非表示になった時点の lastSeenAt を保持する
		// (ここで上書きすると、見ていなかった時間が閲覧済み扱いになる)
		if (window.document.visibilityState !== 'visible') return;
		touchTlDigestLastSeen(activeUserId);
	});

	window.addEventListener('storage', (ev) => {
		if (activeUserId == null || ev.key !== storageKey(activeUserId)) return;
		const synced = loadTlDigestStoredState(activeUserId);
		pendingSinceRef.value = synced?.pendingSince ?? null;
		pendingUntilRef.value = synced?.pendingUntil ?? null;
	});

	heartbeatTimer = window.setInterval(() => {
		if (activeUserId == null) return;
		if (window.document.visibilityState === 'visible') {
			evaluateTlDigestActivity(activeUserId);
		}
	}, HEARTBEAT_INTERVAL_MS);
	void heartbeatTimer;
}
