/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Inject, Injectable } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { DI } from '@/di-symbols.js';
import Logger from '@/logger.js';
import { usageMetrics } from './llm-usage/types.js';
import { monthRange, retentionCutoff } from './llm-usage/utils.js';
import type { DataSource, QueryRunner } from 'typeorm';
import type { UsageCounters, RecordUsage } from './llm-usage/types.js';

const logger = new Logger('llm-usage');
export const usageCounterColumns = ['requests', 'successes', 'failures', ...usageMetrics.flatMap(metric => [`${metric}Tokens`, `${metric}Samples`])];

@Injectable()
export class LlmUsageService {
	private unfinished = 0;
	private lastWarning = 0;
	constructor(@Inject(DI.db) private db: DataSource) {}

	private warn(): void {
		if (Date.now() - this.lastWarning < 60000) return;
		this.lastWarning = Date.now();
		logger.warn('LLM usage recording unavailable; statistics may be incomplete');
	}

	public async readMonth(year: number, month: number) {
		const { start, end } = monthRange(year, month);
		return this.db.transaction('REPEATABLE READ', async manager => {
			const aggregate = async (group?: string) => manager.query(`SELECT ${group ? `"${group}"${group === 'date' ? '::text AS date' : ''}, ` : ''}${usageCounterColumns.map(c => `COALESCE(SUM("${c}"),0)::text AS "${c}"`).join(', ')} FROM llm_usage_daily_total WHERE date >= $1 AND date < $2 ${group ? `GROUP BY "${group}" ORDER BY "${group}"` : ''}`, [start, end]);
			const [summary] = await aggregate();
			const [users] = await manager.query('SELECT COUNT(DISTINCT "userId")::text AS count FROM llm_usage_daily WHERE date >= $1 AND date < $2', [start, end]);
			const [settings] = await manager.query('SELECT "llmUsageStartedAt", "llmUsageRetentionMonths" FROM meta ORDER BY id DESC LIMIT 1');
			return { year, month, timezone: 'UTC' as const, startedAt: new Date(settings.llmUsageStartedAt).toISOString(), retentionMonths: settings.llmUsageRetentionMonths, summary: this.counters(summary), uniqueUsers: users.count as string,
												daily: (await aggregate('date')).map((r: any) => ({ date: typeof r.date === 'string' ? r.date : r.date.toISOString().slice(0, 10), ...this.counters(r) })),
												byPurpose: (await aggregate('purpose')).map((r: any) => ({ purpose: r.purpose as string, ...this.counters(r) })),
												byModel: (await aggregate('model')).map((r: any) => ({ model: r.model as string, ...this.counters(r) })),
			};
		});
	}

	private counters(row: Record<string, string>): UsageCounters {
		return { requests: row.requests, successes: row.successes, failures: row.failures, tokens: Object.fromEntries(usageMetrics.map(metric => [metric, { value: row[`${metric}Samples`] === '0' ? null : row[`${metric}Tokens`], samples: row[`${metric}Samples`] }])) as UsageCounters['tokens'] };
	}

	public async readUsers(query: { year: number; month: number; sort: 'requests' | 'totalTokens'; offset: number; limit: number }) {
		const { start, end } = monthRange(query.year, query.month);
		const sort = query.sort === 'requests' ? 'SUM(requests)' : 'CASE WHEN SUM("totalSamples") = 0 THEN NULL ELSE SUM("totalTokens") END';
		const rows = await this.db.query(`SELECT "userId", ${usageCounterColumns.map(c => `SUM("${c}")::text AS "${c}"`).join(', ')} FROM llm_usage_daily WHERE date >= $1 AND date < $2 GROUP BY "userId" ORDER BY ${sort} DESC NULLS LAST, "userId" ASC LIMIT $3 OFFSET $4`, [start, end, query.limit + 1, query.offset]);
		const selected = rows.slice(0, query.limit);
		const profiles = selected.length ? await this.db.query('SELECT id, username, host, name, CASE WHEN "avatarId" IS NULL THEN NULL ELSE "avatarUrl" END AS "avatarUrl" FROM "user" WHERE id = ANY($1::varchar[]) AND "isDeleted" = false', [selected.map((r: any) => r.userId)]) : [];
		return { items: selected.map((r: any) => { const profile = profiles.find((u: any) => u.id === r.userId); return { userId: r.userId as string, user: profile ? { username: profile.username as string, host: profile.host as string | null, name: profile.name as string | null, avatarUrl: profile.avatarUrl as string | null } : null, counters: this.counters(r) }; }), hasMore: rows.length > query.limit };
	}

	public async cleanup(now: Date): Promise<void> {
		for (let chunk = 0; chunk < 20; chunk++) {
			const runner = this.db.createQueryRunner();
			try {
				await runner.connect(); await runner.startTransaction();
				await runner.query('SET LOCAL statement_timeout = \'1000ms\'');
				await runner.query('SET LOCAL lock_timeout = \'250ms\'');
				const [settings] = await runner.query('SELECT "llmUsageRetentionMonths" FROM meta ORDER BY id DESC LIMIT 1 FOR UPDATE');
				const cutoff = retentionCutoff(now, settings.llmUsageRetentionMonths);
				if (cutoff === null) { await runner.commitTransaction(); return; }
				const keys = await runner.query('SELECT date::text, "userId", purpose, model FROM llm_usage_daily WHERE date < $1 ORDER BY date, "userId", purpose, model LIMIT 500', [cutoff]);
				if (!keys.length) { await runner.commitTransaction(); return; }
				const groups = new Map<string, { date: string; purpose: string; model: string }>();
				for (const key of keys) groups.set(JSON.stringify([key.date, key.purpose, key.model]), key);
				const ordered = [...groups.values()].sort((a, b) => a.date.localeCompare(b.date) || a.purpose.localeCompare(b.purpose) || a.model.localeCompare(b.model));
				for (const key of ordered) {
					const rows = await runner.query('SELECT * FROM llm_usage_daily_total WHERE date=$1 AND purpose=$2 AND model=$3 FOR UPDATE', [key.date, key.purpose, key.model]);
					if (!rows.length) throw new Error('LLM usage aggregate mismatch');
				}
				const deletedResult = await runner.query(`DELETE FROM llm_usage_daily d USING jsonb_to_recordset($1::jsonb) AS k(date date, "userId" varchar, purpose varchar, model text) WHERE d.date=k.date AND d."userId"=k."userId" AND d.purpose=k.purpose AND d.model=k.model RETURNING d.date::text AS date, d.purpose, d.model, ${usageCounterColumns.map(c => `d."${c}"::text AS "${c}"`).join(',')}`, [JSON.stringify(keys)], true);
				const deleted = deletedResult.records;
				for (const key of ordered) {
					const rows = deleted.filter((r: any) => (typeof r.date === 'string' ? r.date : r.date.toISOString().slice(0, 10)) === key.date && r.purpose === key.purpose && r.model === key.model);
					const sums = usageCounterColumns.map(c => rows.reduce((n: bigint, r: any) => n + BigInt(r[c]), 0n).toString());
					const updatedResult = await runner.query(`UPDATE llm_usage_daily_total SET ${usageCounterColumns.map((c, i) => `"${c}"="${c}"-$${i + 4}::bigint`).join(',')} WHERE date=$1 AND purpose=$2 AND model=$3 RETURNING ${usageCounterColumns.map(c => `"${c}"::text AS "${c}"`).join(',')}`, [key.date, key.purpose, key.model, ...sums], true);
					const [remaining] = updatedResult.records;
					if (!remaining || usageCounterColumns.some(c => BigInt(remaining[c]) < 0n)) throw new Error('LLM usage aggregate mismatch');
					const [daily] = await runner.query('SELECT COUNT(*)::text AS n FROM llm_usage_daily WHERE date=$1 AND purpose=$2 AND model=$3', [key.date, key.purpose, key.model]);
					if (remaining.requests === '0' || daily.n === '0') {
						if (usageCounterColumns.some(c => remaining[c] !== '0') || daily.n !== '0') throw new Error('LLM usage aggregate mismatch');
						await runner.query('DELETE FROM llm_usage_daily_total WHERE date=$1 AND purpose=$2 AND model=$3', [key.date, key.purpose, key.model]);
					}
				}
				await runner.commitTransaction();
			} catch (error) {
				if (runner.isTransactionActive) await runner.rollbackTransaction().catch(() => {});
				const reason = error instanceof Error && error.message === 'LLM usage aggregate mismatch' ? 'aggregate_mismatch'
					: error instanceof QueryFailedError && error.driverError?.code === '57014' ? 'statement_timeout'
					: error instanceof QueryFailedError && error.driverError?.code === '55P03' ? 'lock_timeout'
					: 'unknown';
				logger.warn(`LLM usage cleanup incomplete (${reason}); will retry on the next cleanup`);
				return;
			} finally { await runner.release().catch(() => {}); }
		}
	}
	public async record(input: RecordUsage): Promise<void> {
		if (this.unfinished >= 4) { this.warn(); return; }
		this.unfinished++;
		let runner: QueryRunner | undefined;
		let client: { connection?: { stream?: { destroy(error?: Error): void } } } | undefined;
		const deadline = Date.now() + 1500;
		let disposed = false;
		const dispose = () => {
			if (disposed) return;
			disposed = true;
			const error = new Error('LLM usage deadline');
			// Destroy the socket before evicting it: an unfinished transaction must never return to the pool.
			try { client?.connection?.stream?.destroy(error); } catch { /* Best-effort socket destruction must not skip pool eviction. */ }
			const pgRunner = runner as QueryRunner & { releasePostgresConnection(error: Error): Promise<void> };
			try { void pgRunner.releasePostgresConnection(error).catch(() => {}); } catch { /* Cleanup must not escape the deadline callback. */ }
		};
		const bounded = async <T>(operation: () => Promise<T>): Promise<T> => {
			if (disposed) throw new Error('LLM usage deadline');
			let timeout: ReturnType<typeof setTimeout> | undefined;
			try {
				return await Promise.race([operation(), new Promise<never>((_, reject) => {
					timeout = setTimeout(() => { dispose(); reject(new Error('LLM usage deadline')); }, Math.max(0, deadline - Date.now()));
				})]);
			} finally { clearTimeout(timeout); }
		};
		let connected = false;
		let transaction = false;
		let expired = false;
		let latePending = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			runner = this.db.createQueryRunner();
			const connection = runner.connect().then(async (connectionClient) => {
				client = connectionClient;
				if (expired) { try { dispose(); } finally { this.unfinished--; } return false; }
				return true;
			}, err => { if (expired) this.unfinished--; throw err; });
			connected = await Promise.race([connection, new Promise<false>(resolve => { timer = setTimeout(() => { expired = true; resolve(false); }, 1000); })]);
			clearTimeout(timer);
			if (!connected) { latePending = true; this.warn(); return; }
			await bounded(() => runner!.startTransaction());
			transaction = true;
			await bounded(() => runner!.query('SET LOCAL statement_timeout = \'1000ms\''));
			await bounded(() => runner!.query('SET LOCAL lock_timeout = \'250ms\''));
			const counters = [1, input.success ? 1 : 0, input.success ? 0 : 1, ...usageMetrics.flatMap(metric => [input.success ? input.usage[metric] ?? 0 : 0, input.success && input.usage[metric] !== null ? 1 : 0])];
			for (const personal of [false, true]) {
				const table = personal ? 'llm_usage_daily' : 'llm_usage_daily_total';
				const keys = ['date', ...(personal ? ['userId'] : []), 'purpose', 'model'];
				const columns = [...keys, ...usageCounterColumns];
				const values = [input.completedAt.toISOString().slice(0, 10), ...(personal ? [input.userId] : []), input.purpose, input.model, ...counters];
				await bounded(() => runner!.query(`INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')}) ON CONFLICT (${keys.map(c => `"${c}"`).join(', ')}) DO UPDATE SET ${usageCounterColumns.map(c => `"${c}" = "${table}"."${c}" + EXCLUDED."${c}"`).join(', ')}`, values));
			}
			await bounded(() => runner!.commitTransaction());
			transaction = false;
		} catch {
			this.warn();
			if (transaction && !disposed) { try { await bounded(() => runner!.rollbackTransaction()); } catch { this.warn(); } }
		} finally {
			clearTimeout(timer);
			if (connected && !disposed) { try { await bounded(() => runner!.release()); } catch { this.warn(); } }
			if (!latePending) this.unfinished--;
		}
	}
}
