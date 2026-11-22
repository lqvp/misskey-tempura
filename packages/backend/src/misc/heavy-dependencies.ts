/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

let juice: Promise<typeof import('juice')> | undefined;
let webAuthn: ReturnType<typeof importWebAuthn> | undefined;
let nodemailer: ReturnType<typeof importNodemailer> | undefined;
let sanitizeHtml: ReturnType<typeof importSanitizeHtml> | undefined;
let got: ReturnType<typeof importGot> | undefined;
let libStorage: ReturnType<typeof importLibStorage> | undefined;

function importNodemailer() {
	return import('nodemailer');
}

// Email transport adds ~0.23 MiB of bundled code; neither worker nor server needs it at idle.
export function loadNodemailer() {
	return nodemailer ??= importNodemailer();
}

function importSanitizeHtml() {
	return import('sanitize-html');
}

// Sanitizing email adds ~0.19 MiB at worker idle; the server already loads it for plain-text conversion.
export function loadSanitizeHtml() {
	return sanitizeHtml ??= importSanitizeHtml();
}

function importGot() {
	return import('got');
}

// Downloads add ~0.18 MiB of bundled code; neither worker nor server needs Got at idle.
export function loadGot() {
	return got ??= importGot();
}

function importLibStorage() {
	return import('@aws-sdk/lib-storage');
}

// Multipart uploads add ~0.01 MiB of bundled code; neither worker nor server needs them at idle.
export function loadLibStorage() {
	return libStorage ??= importLibStorage();
}

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
