/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * TL ダイジェストの処理時間を計測するための軽量ヘルパ。
 *
 * 方針:
 * - 計測は `performance.mark` / `performance.measure` で行い、開発時のみ出力する。
 *   本番ビルドで `console.debug` が走り続けないよう、出力は `import.meta.env.DEV` で判定する。
 * - 計測結果は直近 N 件をメモリ上に保持する。UI には出さず、開発時の調査と
 *   テストからの参照のためだけに使う (永続化しない)。
 * - `performance` API が無い環境 (SSR 等) でも落ちないようフォールバックする。
 */

export type TlDigestPhase =
	| 'scan'
	| 'filter'
	| 'generate'
	| 'count';

export interface TlDigestMetricEntry {
	phase: TlDigestPhase;
	durationMs: number;
	/** 走査件数・入力件数など、その処理の規模を表す補助値 */
	size?: number;
	at: number;
}

const MAX_ENTRIES = 50;

const entries: TlDigestMetricEntry[] = [];

function now(): number {
	if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
		return performance.now();
	}
	return Date.now();
}

function isDev(): boolean {
	try {
		return import.meta.env.DEV;
	} catch {
		return false;
	}
}

/** 計測された処理時間の一覧 (古い順) を返す */
export function getTlDigestMetrics(): readonly TlDigestMetricEntry[] {
	return entries;
}

/** 計測結果を破棄する (テスト用) */
export function clearTlDigestMetrics(): void {
	entries.length = 0;
}

/**
 * 同期処理の所要時間を計測する。
 * @param size 処理規模 (入力ノート数など)。省略可。
 */
export function measureTlDigestSync<T>(
	phase: TlDigestPhase,
	fn: () => T,
	size?: number,
): { value: T; durationMs: number } {
	const start = now();
	const value = fn();
	const durationMs = now() - start;
	record(phase, durationMs, size);
	return { value, durationMs };
}

/**
 * 非同期処理の所要時間を計測する。例外時も計測結果は記録する。
 */
export async function measureTlDigestAsync<T>(
	phase: TlDigestPhase,
	fn: () => Promise<T>,
	size?: number,
): Promise<T> {
	const start = now();
	try {
		return await fn();
	} finally {
		record(phase, now() - start, size);
	}
}

function record(phase: TlDigestPhase, durationMs: number, size?: number): void {
	const entry: TlDigestMetricEntry = {
		phase,
		durationMs,
		size,
		at: Date.now(),
	};
	entries.push(entry);
	if (entries.length > MAX_ENTRIES) entries.shift();
	if (isDev()) {
		// 開発時のみ: どのフェーズが重いかをすぐ確認できるようにする
		console.debug(
			`[tl-digest] ${phase}: ${durationMs.toFixed(1)}ms${size != null ? ` (${size} notes)` : ''}`,
		);
	}
}
