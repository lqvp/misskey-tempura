/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Only changed key/scope records are applied, under a cross-tab lock. The lock
// must cover the latest read and write, not just the final localStorage.setItem.
type Profile = { storageRevision?: string; id: string; name: string; preferences: Record<string, unknown[]> };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const scopeId = (record: unknown) => {
	const scope = (record as [Record<string, unknown>])[0];
	return JSON.stringify([scope.server ?? null, scope.account ?? null, scope.device ?? null]);
};

// The device account list is itself a shared collection. Merge membership by
// host/user ID, rather than replacing the array from a stale tab snapshot.
function mergeAccounts(before: unknown, local: unknown, latest: unknown): unknown {
	if (!Array.isArray(before) || !Array.isArray(local) || !Array.isArray(latest)) return local;
	type Account = [string, { id: string; username: string }];
	const id = (entry: Account) => JSON.stringify([entry[0], entry[1].id]);
	const old = new Map(before.map(entry => [id(entry), entry]));
	const next = new Map(local.map(entry => [id(entry), entry]));
	const result = latest.filter(entry => !old.has(id(entry)) || next.has(id(entry)));
	for (const [key, entry] of next) {
		if (same(old.get(key), entry)) continue;
		const index = result.findIndex(item => id(item) === key);
		if (index < 0) {
			// An update to an existing entry must not resurrect a removed account.
			if (!old.has(key)) result.push(entry);
		} else result[index] = entry;
	}
	return result;
}

export function mergePreferenceWrite<T extends Profile>(before: T | null, local: T, latest: T | null): T {
	if (before && (!latest || latest.id !== before.id || latest.storageRevision !== before.storageRevision)) throw new Error('Preference profile changed in another tab; reload before saving');
	if (!latest || (before && before.id !== local.id)) return structuredClone(local);
	const baseline = before ?? { ...local, preferences: {} };
	const result = structuredClone(latest);
	if (baseline.name !== local.name) result.name = local.name;
	for (const key of new Set([...Object.keys(baseline.preferences), ...Object.keys(local.preferences)])) {
		const oldRecords = baseline.preferences[key] ?? [];
		const newRecords = local.preferences[key] ?? [];
		if (same(oldRecords, newRecords)) continue;
		const records = result.preferences[key] ?? [];
		const oldByScope = new Map(oldRecords.map(r => [scopeId(r), r]));
		const newByScope = new Map(newRecords.map(r => [scopeId(r), r]));
		result.preferences[key] = records.filter(r => !oldByScope.has(scopeId(r)) || newByScope.has(scopeId(r)));
		for (const [scope, record] of newByScope) {
			if (same(oldByScope.get(scope), record)) continue;
			const index = result.preferences[key].findIndex(r => scopeId(r) === scope);
			if (index < 0) result.preferences[key].push(structuredClone(record));
			else {
				const changed = structuredClone(record) as unknown[];
				if (key === 'accounts') changed[1] = mergeAccounts((oldByScope.get(scope) as unknown[] | undefined)?.[1] ?? [], changed[1], (result.preferences[key][index] as unknown[])[1]);
				result.preferences[key][index] = changed;
			}
		}
	}
	return { ...result, modifiedAt: Date.now() };
}

export class PreferenceWriteQueue<T extends Profile> {
	private tail: Promise<void> = Promise.resolve();
	private failedBefore: T | null | undefined;
	constructor(private io: { lock: <R>(work: () => R) => Promise<R>; read: () => T | null; write: (profile: T) => void }) {}

	save(before: T | null, profile: T): Promise<void> {
		const previous = before ? structuredClone(before) : null;
		const next = structuredClone(profile);
		this.tail = this.tail.catch(() => {}).then(async () => {
			const baseline = this.failedBefore === undefined ? previous : this.failedBefore;
			try {
				await this.io.lock(() => this.io.write(mergePreferenceWrite(baseline, next, this.io.read())));
				this.failedBefore = undefined;
			} catch (err) {
				this.failedBefore = baseline;
				throw err;
			}
		});
		return this.tail;
	}

	flush(): Promise<void> {
		return this.tail;
	}
}
