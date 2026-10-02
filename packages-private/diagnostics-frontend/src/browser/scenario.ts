/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { api, closeUserSetupDialog, postNote, registerUser, resetState, signupThroughUi, visitHome } from '../../../../packages/frontend/test/e2e/shared';
import { sleep } from './server';
import type { HeadlessChromeController } from './controller';

export const scenarioDescription = 'fresh browser signup, first timeline note, after the note becomes visible';

/**
 * 各ラウンドを同じ初期状態から始めるため、DBを消して管理者だけ作り直す。
 * fork固有の招待コード確認ステップを通すため、管理者トークンで招待コードを発行して返す。
 */
export async function prepareInstance(baseUrl: string): Promise<string> {
	await resetState(baseUrl);
	const admin = await registerUser(baseUrl, 'admin', 'admin1234', true);
	const code = await api(baseUrl, 'invite/create', { i: admin.token }) as { code?: unknown } | null;
	if (code == null || typeof code.code !== 'string') {
		throw new Error('/api/invite/create did not return an invitation code');
	}
	return code.code;
}

export async function runSignupAndPostScenario(chrome: HeadlessChromeController, baseUrl: string, invitationCode: string) {
	const page = chrome.page;
	const noteText = `Frontend browser metrics ${Date.now()}`;

	await visitHome(page, baseUrl);
	await signupThroughUi(page, { username: 'alice', password: 'password', invitationCode });
	await closeUserSetupDialog(page);
	await postNote(page, noteText, 10_000);

	// 投稿直後の非同期処理が落ち着いてから計測したいので少し待つ
	await sleep(1000);
}
