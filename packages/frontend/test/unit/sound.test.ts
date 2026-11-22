/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';

vi.mock('@/preferences.js', () => ({ prefer: {} }));
vi.mock('@/preferences/def.js', () => ({ PREF_DEF: {} }));
vi.mock('@/preferences/manager.js', () => ({ getInitialPrefValue: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

test('custom decoded audio uses a byte budget while built-in sounds stay cached', async () => {
	const decodeAudioData = vi.fn(async (encoded: ArrayBuffer) => ({
		length: new Uint8Array(encoded)[0] * 1024 * 1024 / 8,
		numberOfChannels: 2,
	}));
	vi.stubGlobal('AudioContext', class {
		decodeAudioData = decodeAudioData;
	});
	vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
		arrayBuffer: async () => Uint8Array.of(url === '/large' ? 17 : 8).buffer,
	})));
	const { loadAudio } = await import('@/utility/sound.js');

	const builtin = await loadAudio('/client-assets/sounds/syuilo/n-aec.mp3');
	const a = await loadAudio('/a');
	const b = await loadAudio('/b');
	expect(await loadAudio('/a')).toBe(a);
	await loadAudio('/c');
	expect(await loadAudio('/a')).toBe(a);
	expect(await loadAudio('/b')).not.toBe(b);
	expect(await loadAudio('/client-assets/sounds/syuilo/n-aec.mp3')).toBe(builtin);

	const large = await loadAudio('/large');
	expect(await loadAudio('/large')).not.toBe(large);
	expect(decodeAudioData).toHaveBeenCalledTimes(7);
});
