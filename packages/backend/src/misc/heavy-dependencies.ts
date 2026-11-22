/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

let juice: Promise<typeof import('juice')> | undefined;
let webAuthn: ReturnType<typeof importWebAuthn> | undefined;

// Email CSS processing adds ~0.4–0.5 MiB of bundled code; neither worker nor server needs it at idle.
export function loadJuice() {
	return juice ??= import('juice');
}

async function importWebAuthn() {
	const [server, { isoCBOR, isoUint8Array }] = await Promise.all([
		import('@simplewebauthn/server'),
		import('@simplewebauthn/server/helpers'),
	]);
	return { ...server, isoCBOR, isoUint8Array };
}

// WebAuthn/certificate helpers add ~0.43 MiB of bundled code; neither worker nor server needs them at idle.
export function loadWebAuthn() {
	return webAuthn ??= importWebAuthn();
}
