/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { host } from '@@/js/config.js';
import { PREF_DEF } from '@/preferences/def.js';
import { PREF_CARRYOVER, STORE_CARRYOVER, collectReferences, sanitizeAfterProbe } from '@/utility/sub-account-carryover.js';
import type { CarryoverResult, ProbeRef } from '@/utility/sub-account-carryover.js';
import { prefer } from '@/preferences.js';
import { store } from '@/store.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

type Item = { scope: string[]; key: string; value: unknown };

type Candidate = {
	label: string; // shown in the result
	key: string;
	value: unknown;
	kind: 'pref' | 'store';
	/** registry item to write for the sub-account (null: device-local only) */
	registry: ((subId: string, value: unknown) => Item) | null;
};

/** Settings of the main account that belong to the account (not the device), minus everything classified as never. */
function collectCandidates(): Candidate[] {
	const out: Candidate[] = [];
	for (const [key, def] of Object.entries(PREF_DEF) as [keyof typeof PREF_DEF, { accountDependent?: boolean }][]) {
		if (PREF_CARRYOVER[key] === 'never' || def.accountDependent !== true) continue;
		const synced = prefer.isSyncEnabled(key);
		out.push({
			label: key,
			key,
			value: prefer.s[key],
			kind: 'pref',
			registry: synced ? (subId, value) => ({ scope: ['client', 'preferences', 'sync'], key: `default:${key}`, value: [[{ server: host, account: subId }, value]] }) : null,
		});
	}
	for (const [key, def] of Object.entries(store.def) as [keyof typeof STORE_CARRYOVER, { where: string }][]) {
		if (def.where !== 'account' || STORE_CARRYOVER[key] === 'never') continue;
		out.push({ label: key, key, value: store.s[key as keyof typeof store.s], kind: 'store', registry: (_id, value) => ({ scope: ['client', 'base'], key, value }) });
	}
	return out;
}

function classOf(c: Candidate) {
	return c.kind === 'pref' ? PREF_CARRYOVER[c.key as keyof typeof PREF_CARRYOVER] : STORE_CARRYOVER[c.key as keyof typeof STORE_CARRYOVER];
}

/**
 * Carry the main account's settings over to a freshly created sub-account, once.
 * References to account-owned objects are checked as the sub-account first; unusable ones are emptied.
 */
export async function carryOverSettings(subId: string): Promise<CarryoverResult> {
	const result: CarryoverResult = { copied: [], emptied: [], skipped: [] };
	const candidates = collectCandidates();

	const refs = new Map<string, ProbeRef>();
	for (const c of candidates) {
		if (classOf(c) !== 'copy-after-probe') continue;
		for (const r of collectReferences(c.key, c.value)) refs.set(`${r.type}:${r.id}`, r);
	}
	let usable: ProbeRef[] = [];
	if (refs.size > 0) {
		usable = (await misskeyApi('i/sub-accounts/probe-references', { subId, references: [...refs.values()] })).usable;
	}

	const items: Item[] = [];
	const localPrefs: { key: string; value: unknown }[] = [];
	for (const c of candidates) {
		let value = c.value;
		if (classOf(c) === 'copy-after-probe') {
			const s = sanitizeAfterProbe(c.key, value, usable);
			value = s.value;
			if (s.removed > 0) result.emptied.push(c.label);
			else result.copied.push(c.label);
		} else {
			result.copied.push(c.label);
		}
		if (c.registry) items.push(c.registry(subId, value));
		if (c.kind === 'pref') localPrefs.push({ key: c.key, value });
	}
	// only account data counts as "not carried"; device-only keys were never account data
	for (const [k, def] of Object.entries(PREF_DEF) as [keyof typeof PREF_DEF, { accountDependent?: boolean }][]) if (PREF_CARRYOVER[k] === 'never' && def.accountDependent === true) result.skipped.push(k);
	for (const [k, def] of Object.entries(store.def) as [keyof typeof STORE_CARRYOVER, { where: string }][]) if (STORE_CARRYOVER[k] === 'never' && def.where === 'account') result.skipped.push(k);

	// server first: if this fails nothing is applied locally and the sub-account keeps its defaults
	await misskeyApi('i/sub-accounts/save-initial-settings', { subId, items });

	// on this device the preferences profile is shared by all accounts, so the sub-account gets its own records here
	const scope = { server: host, account: subId };
	for (const { key, value } of localPrefs) {
		const records = (prefer.profile.preferences as Record<string, unknown>)[key] as unknown as [Record<string, string>, unknown, Record<string, unknown>][];
		const i = records.findIndex(([sc]) => sc.server === host && sc.account === subId);
		if (i === -1) records.push([scope, value, {}]);
		else records[i] = [scope, value, records[i][2]];
	}
	prefer.save();

	return result;
}

export async function createSubAccountFlow(): Promise<boolean> {
	const preview = await misskeyApi('i/sub-accounts/create-preview');
	if (!preview.canCreate) {
		await os.alert({ type: 'error', title: i18n.ts.createSubAccount, text: preview.reason === 'LIMIT_REACHED' ? i18n.tsx.subAccountLimitReached({ limit: preview.limit }) : i18n.ts.subAccountCannotCreate });
		return false;
	}
	if (preview.requiresApproval) {
		const { canceled } = await os.confirm({ type: 'warning', title: i18n.ts.createSubAccount, text: i18n.ts.subAccountPendingApprovalConfirm });
		if (canceled) return false;
	}
	const { canceled, result: username } = await os.inputText({ title: i18n.ts.createSubAccount, text: i18n.tsx.subAccountRemaining({ remaining: preview.remaining }), placeholder: i18n.ts.username, minLength: 1 });
	if (canceled || username == null) return false;

	const created = await misskeyApi('i/sub-accounts/create', { username, confirmPending: preview.requiresApproval }).catch(async err => {
		await os.alert({ type: 'error', title: i18n.ts.createSubAccount, text: err?.message ?? String(err) });
		return null;
	});
	if (created == null) return false;

	let summary: string;
	try {
		const r = await carryOverSettings(created.subAccount.id);
		summary = [
			i18n.tsx.subAccountCarriedOver({ n: r.copied.length }),
			r.emptied.length > 0 ? i18n.tsx.subAccountEmptied({ names: r.emptied.join(', ') }) : null,
			i18n.tsx.subAccountNotCarried({ n: r.skipped.length }),
		].filter(x => x != null).join('\n');
	} catch (err: any) {
		summary = i18n.tsx.subAccountCarryFailed({ message: err?.message ?? String(err) });
	}
	await os.alert({ type: 'success', title: i18n.ts.subAccountCreated, text: (created.requiresApproval ? i18n.ts.subAccountPendingApproval + '\n' : '') + summary });
	return true;
}
