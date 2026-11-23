/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MediaProxy } from '@@/js/media-proxy.js';
import { url } from '@@/js/config.js';
import { instance } from '@/instance.js';
import { prefer } from '@/preferences.js';

let _mediaProxy: MediaProxy | null = null;

function ensureMediaProxy(): MediaProxy {
	if (_mediaProxy == null) {
		_mediaProxy = new MediaProxy(
			instance,
			url,
			() => prefer.r?.mediaProxy?.value ?? prefer.s?.mediaProxy,
		);
	}

	return _mediaProxy;
}

export function getProxiedImageUrl(...args: Parameters<MediaProxy['getProxiedImageUrl']>): string {
	return ensureMediaProxy().getProxiedImageUrl(...args);
}

export function getProxiedImageUrlNullable(...args: Parameters<MediaProxy['getProxiedImageUrlNullable']>): string | null {
	return ensureMediaProxy().getProxiedImageUrlNullable(...args);
}

export function getStaticImageUrl(...args: Parameters<MediaProxy['getStaticImageUrl']>): string {
	return ensureMediaProxy().getStaticImageUrl(...args);
}

export function rewriteProxiedImageUrl(...args: Parameters<MediaProxy['rewriteProxiedImageUrl']>): string {
	return ensureMediaProxy().rewriteProxiedImageUrl(...args);
}

export function rewriteProxiedImageUrlNullable(...args: Parameters<MediaProxy['rewriteProxiedImageUrlNullable']>): string | null {
	return ensureMediaProxy().rewriteProxiedImageUrlNullable(...args);
}
