/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from 'vitest';
import { PreferenceWriteQueue } from '@/preferences/write.js';
import { PreferencesManager } from '@/preferences/manager.js';
import type { PossiblyNonNormalizedPreferencesProfile, StorageProvider } from '@/preferences/manager.js';

// Two tabs have independent in-memory profiles and one persisted localStorage record.
test('a save in another tab must not erase a previous different-account preference update', async () => {
	let saved: PossiblyNonNormalizedPreferencesProfile | null = null;
	let tail = Promise.resolve();
	const writes = new PreferenceWriteQueue({
		lock: work => { const next = tail.then(work); tail = next.then(() => {}, () => {}); return next; },
		read: () => saved,
		write: profile => { saved = profile; },
	});
	const io: StorageProvider = {
		load: () => saved ? structuredClone(saved) : null,
		save: ({ profile, before }) => writes.save(before, profile),
		cloudGetBulk: async () => ({}),
		cloudGet: async () => null,
		cloudSet: async () => {},
	};
	const alice = new PreferencesManager(io, { id: 'alice' });
	await alice.cloudReady; await alice.flush();
	const bob = new PreferencesManager(io, { id: 'bob' });
	await bob.cloudReady; await bob.flush();
	alice.commit('uploadFolder', 'alice-folder');
	bob.commit('uploadFolder', 'bob-folder');
	await Promise.all([alice.flush(), bob.flush()]);
	const reloadedAlice = new PreferencesManager(io, { id: 'alice' });
	await reloadedAlice.cloudReady;
	expect(reloadedAlice.s.uploadFolder).toBe('alice-folder');
});

test('a slow cloud response must not overwrite an in-flight local edit', async () => {
 let saved: PossiblyNonNormalizedPreferencesProfile | null = null;
 const seed: StorageProvider = { load: () => saved, save: ({ profile }) => { saved = structuredClone(profile); }, cloudGetBulk: async () => ({}), cloudGet: async () => null, cloudSet: async () => {} };
 const first = new PreferencesManager(seed, { id: 'alice' });
 await first.cloudReady;
 const rec = saved!.preferences.uploadFolder.find(([scope]) => scope.account === 'alice')!;
 rec[2].sync = true;
 let resolveFetch!: (value: any) => void;
 const delayed = new Promise<any>(resolve => { resolveFetch = resolve; });
 const manager = new PreferencesManager({ ...seed, cloudGetBulk: () => delayed }, { id: 'alice' });
 manager.commit('uploadFolder', 'local-edit');
 resolveFetch({ uploadFolder: 'stale-cloud' });
 await manager.cloudReady;
 expect(manager.s.uploadFolder).toBe('local-edit');
});
