/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fileURLToPath } from 'node:url';

export const managerEntries = (entries = []) => [
	...entries,
	fileURLToPath(new URL('./manager.js', import.meta.url)),
];

export const previewAnnotations = (entries = []) => [
	...entries,
	fileURLToPath(new URL('./preview.js', import.meta.url)),
];
