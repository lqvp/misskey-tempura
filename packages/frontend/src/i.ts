/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { reactive } from 'vue';
import '@/style/tab-account-error.scss';
import * as Misskey from 'misskey-js';
import { host } from '@@/js/config.js';
import { i18n } from '@/i18n.js';
import { bootstrapAccount } from '@/utility/tab-account-bootstrap.js';
import { accountUrl } from '@/utility/tab-account.js';
import { reloadChannel } from '@/utility/unison-reload.js';

// TODO: 他のタブと永続化されたstateを同期

type AccountWithToken = Misskey.entities.MeDetailed & { token: string };

// Install before bootstrap so even an unavailable-account tab receives logout/reload.
reloadChannel.addEventListener('message', path => {
	if (path === null) {
		window.location.reload();
		return;
	}
	const target = new URL(path, window.location.href);
	target.searchParams.delete('as');
	target.searchParams.delete('loginId');
	window.location.href = path === '/' ? path : accountUrl(target.href, new URLSearchParams(window.location.search).get('as'));
});

function stopTabAccount() {
	// Stop before any account-dependent modules boot. The loader's error screen may be disabled.
	const panel = window.document.createElement('main');
	panel.className = 'tabAccountError';
	const card = window.document.createElement('section');
	card.className = '_panel tabAccountErrorCard';
	card.setAttribute('aria-labelledby', 'tab-account-error-title');
	const title = window.document.createElement('h1');
	title.id = 'tab-account-error-title';
	title.textContent = i18n.ts._tabAccount.unavailable;
	const description = window.document.createElement('p');
	description.textContent = i18n.ts._tabAccount.unavailableDescription;
	const home = window.document.createElement('a');
	home.className = '_button tabAccountErrorButton tabAccountErrorPrimary';
	home.href = '/';
	home.textContent = i18n.ts._tabAccount.goHome;
	const homeDescription = window.document.createElement('p');
	homeDescription.className = 'tabAccountErrorHint';
	homeDescription.textContent = i18n.ts._tabAccount.openFirstDescription;
	const retry = window.document.createElement('button');
	retry.type = 'button';
	retry.className = '_button tabAccountErrorRetry';
	retry.textContent = i18n.ts.reload;
	retry.addEventListener('click', () => window.location.reload());
	card.append(title, description, home, homeDescription, retry);
	panel.append(card);
	window.document.body.replaceChildren(panel);
}

const accountData = await bootstrapAccount(window.location.href, host).catch(error => {
	stopTabAccount();
	throw error;
});
if (accountData) window.history.replaceState(window.history.state, '', accountUrl(window.location.href, accountData.id));

// TODO: 外部からはreadonlyに
export const $i = accountData ? reactive(accountData as AccountWithToken) : null;

export const iAmModerator = $i != null && ($i.isAdmin === true || $i.isModerator === true);
export const iAmAdmin = $i != null && $i.isAdmin;

export function ensureSignin() {
	if ($i == null) throw new Error('signin required');
	return $i;
}

export let notesCount = $i == null ? 0 : $i.notesCount;
export function incNotesCount() {
	notesCount++;
}

if (_DEV_) {
	(window as any).$i = $i;
}
