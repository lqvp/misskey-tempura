/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { I18n } from '@@/js/i18n.js';
import type { Locale } from 'i18n';
import { swLang } from '@/scripts/lang.js';

/**
 * Admin-provided customization for the offline page (delivered via `meta`,
 * stored by the SW message handler). Kept versioned for future schema changes.
 */
export type OfflinePageConfig = {
	version: 1;
	message?: string;
	contactUrl?: string;
};

export type OfflineReason = { kind: 'network' } | { kind: 'server'; status: number };

// https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html#output-encoding-for-html-contexts
function escapeHtml(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#x27;');
}

function escapeJsString(text: string): string {
	// The string is embedded inside a double-quoted JS string literal in inline JS.
	return text
		.replaceAll('\\', '\\\\')
		.replaceAll('"', '\\"')
		.replaceAll('\n', '\\n')
		.replaceAll('\r', '\\r')
		// prevent "</script>" inside the string from closing the inline script tag
		.replaceAll('</', '<\\/');
}

export async function renderOfflinePage(reason: OfflineReason, config?: OfflinePageConfig): Promise<string> {
	let i18n: Partial<I18n<Locale>>;
	try {
		i18n = await (swLang.i18n ?? await swLang.fetchLocale()) as Partial<I18n<Locale>>;
	} catch {
		i18n = {};
	}

	const messages = {
		title: i18n.ts?._offlineScreen.title ?? 'Offline - Could not connect to server',
		header: i18n.ts?._offlineScreen.header ?? 'Could not connect to server',
		descriptionNetwork: i18n.ts?._offlineScreen.descriptionNetwork ?? 'There is no internet connection, or the server may be down.',
		descriptionServer: i18n.ts?._offlineScreen.descriptionServer ?? 'The server is returning an error.',
		retry: i18n.ts?._offlineScreen.retry ?? 'Retry',
		autoRetrying: i18n.ts?._offlineScreen.autoRetrying ?? 'Retrying automatically...',
		autoRetryStopped: i18n.ts?._offlineScreen.autoRetryStopped ?? 'Automatic retry has been stopped. Please retry manually.',
		reload: i18n.ts?.reload ?? 'Reload',
	};

	const origin = escapeHtml(globalThis.location.origin);
	const kind = reason.kind;
	const status = kind === 'server' ? escapeHtml(String(reason.status)) : '';
	const adminMessage = config?.message ? escapeHtml(config.message) : '';
	// only render the link when the scheme is http(s) so a malicious value such as
	// "javascript:..." cannot turn the anchor into a script execution path
	const safeContactUrl = config?.contactUrl != null && /^https?:\/\//.test(config.contactUrl) ? config.contactUrl : null;
	const contactUrl = safeContactUrl != null ? escapeHtml(safeContactUrl) : '';
	// locale strings are bundled build artifacts, but escape them for consistency
	const title = escapeHtml(messages.title);
	const header = escapeHtml(messages.header);
	const description = kind === 'network' ? escapeHtml(messages.descriptionNetwork) : escapeHtml(messages.descriptionServer);

	// NOTE: The inline <script> must not use backticks or ${} (string concatenation only)
	// so it stays valid regardless of the surrounding template literal.
	return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta content="width=device-width,initial-scale=1" name="viewport">
<title>${title}</title>
<style>
body{background-color:#0c1210;color:#dee7e4;font-family:Hiragino Maru Gothic Pro,BIZ UDGothic,Roboto,HelveticaNeue,Arial,sans-serif;line-height:1.35;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box}
.icon{max-width:120px;width:100%;height:auto;margin-bottom:20px}
.message{text-align:center;font-size:20px;font-weight:700;margin-bottom:8px}
.description{text-align:center;font-size:14px;opacity:.8;margin-bottom:8px}
.origin{text-align:center;font-size:12px;opacity:.6;margin-bottom:8px;font-family:monospace;word-break:break-all}
.version{text-align:center;font-size:90%;opacity:.7;margin-bottom:20px}
.status{color:#ff6b6b;font-size:16px;font-weight:700;margin-bottom:8px}
button{padding:7px 14px;min-width:100px;font-weight:700;font-family:Hiragino Maru Gothic Pro,BIZ UDGothic,Roboto,HelveticaNeue,Arial,sans-serif;line-height:1.35;border-radius:99rem;background-color:#b4e900;color:#192320;border:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
button:hover{background-color:#c6ff03}
.retry-status{text-align:center;font-size:14px;opacity:.7;margin-top:12px;min-height:1.35em}
</style>
</head>
<body>
<svg class="icon" fill="none" height="24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24v24H0z" fill="none" stroke="none"/><path d="M9.58 5.548c.24 -.11 .492 -.207 .752 -.286c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 .957 -.383 1.824 -1.003 2.454m-2.997 1.033h-11.343c-2.572 -.004 -4.657 -2.011 -4.657 -4.487c0 -2.475 2.085 -4.482 4.657 -4.482c.13 -.582 .37 -1.128 .7 -1.62"/><path d="M3 3l18 18"/></svg>
<div class="message">${header}</div>
<div class="status">${status}</div>
<div class="description">${description}</div>
<div class="origin">${origin}</div>
<div class="description">${adminMessage}</div>
<div class="version">v${_VERSION_}</div>
<button onclick="reloadPage()">${messages.reload}</button>
<div class="retry-status" id="retry-status"></div>
${contactUrl ? `<a href="${contactUrl}" style="color:#b4e900;font-size:14px;margin-top:8px" rel="noopener noreferrer" target="_blank">${contactUrl}</a>` : ''}
<script>
(function() {
	var KIND = "${escapeJsString(kind)}";
	var MAX_ATTEMPTS = 3;
	var INITIAL_BACKOFF_MS = 5000;
	var MAX_BACKOFF_MS = 20000;

	// The attempt counter is also kept in memory so that auto retry stops
	// after MAX_ATTEMPTS even when sessionStorage is unavailable.
	var attemptsInMemory = 0;

	function getAttempts() {
		try {
			var value = sessionStorage.getItem("misskey:offline-page:retry-attempts");
			return value === null ? 0 : parseInt(value, 10) || 0;
		} catch (error) {
			return attemptsInMemory;
		}
	}

	function setAttempts(attempts) {
		attemptsInMemory = attempts;
		try {
			sessionStorage.setItem("misskey:offline-page:retry-attempts", String(attempts));
		} catch (error) {
			// sessionStorage may be unavailable (e.g. private mode); keep the memory counter
		}
	}

	function setStatus(text) {
		var element = document.getElementById("retry-status");
		if (element) element.textContent = text;
	}

	function checkServer() {
		// Always append a query so the SW navigation handler (which intercepts
		// URLs ending with "/") does not intercept this HEAD request and feed us
		// the offline page itself (false-positive recovery -> reload loop).
		var url = location.pathname + "?sw-offline-check=" + Date.now();
		// A server may accept the connection but never respond; abort the
		// probe so the retry loop is not stalled forever.
		var controller = new AbortController();
		var timer = setTimeout(function() {
			controller.abort();
		}, 10000);
		return fetch(url, { method: "HEAD", cache: "no-store", signal: controller.signal }).then(function(response) {
			clearTimeout(timer);
			if (KIND === "network") {
				// Any HTTP response (even 4xx/405 from a proxy that rejects HEAD)
				// means the server is alive again.
				return true;
			}
			// For server errors, only statuses below 500 count as recovery.
			return response.status < 500;
		}).catch(function() {
			clearTimeout(timer);
			return false;
		});
	}

	function reloadPage() {
		// Manual retry resets the attempt counter
		setAttempts(0);
		location.reload();
	}

	function setRecoveryReload() {
		try {
			sessionStorage.setItem("misskey:offline-page:recovery-reload", "1");
		} catch (error) {
			// sessionStorage may be unavailable; the worst case is that a
			// false-positive recovery keeps retrying until the user intervenes
		}
	}

	function consumeRecoveryReload() {
		try {
			if (sessionStorage.getItem("misskey:offline-page:recovery-reload") === null) return false;
			sessionStorage.removeItem("misskey:offline-page:recovery-reload");
			return true;
		} catch (error) {
			return false;
		}
	}

	function scheduleRetry() {
		var attempts = getAttempts();
		if (attempts >= MAX_ATTEMPTS) {
			setStatus("${escapeJsString(messages.autoRetryStopped)}");
			return;
		}
		var backoff = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempts), MAX_BACKOFF_MS);
		setStatus("${escapeJsString(messages.autoRetrying)}");
		setTimeout(function() {
			checkServer().then(function(recovered) {
				if (recovered) {
					// The HEAD probe may succeed (e.g. a proxy answers 405) while
					// the actual navigation still fails. Mark the reload so that
					// landing on this page again counts as a failed attempt
					// instead of resetting the counter (avoids a reload loop).
					setRecoveryReload();
					location.reload();
				} else {
					setAttempts(attempts + 1);
					scheduleRetry();
				}
			});
		}, backoff);
	}

	window.reloadPage = reloadPage;
	if (consumeRecoveryReload()) {
		// We reloaded after a "recovery" but landed on the offline page again:
		// the recovery was a false positive, so it counts as a failed attempt.
		setAttempts(getAttempts() + 1);
	}
	scheduleRetry();
})();
</script>
</body>
</html>`;
}
