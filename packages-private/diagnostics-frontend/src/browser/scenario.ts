/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { closeUserSetupDialog, createInvitationCode, postNote, registerUser, resetState, signupThroughUi, visitHome } from '../../../../packages/frontend/test/e2e/shared';
import { sleep } from './server';
import type { HeadlessChromeController } from './controller';

export const scenarioDescription = 'fresh browser signup, first timeline note, after the note becomes visible';

/**
 * 各ラウンドを同じ初期状態から始めるため、DBを消して管理者だけ作り直す。
 */
export async function prepareInstance(baseUrl: string): Promise<string> {
	await resetState(baseUrl);
	const admin = await registerUser(baseUrl, 'admin', 'admin1234', true);
	return await createInvitationCode(baseUrl, admin.token);
}

export async function runSignupAndPostScenario(chrome: HeadlessChromeController, baseUrl: string, invitationCode: string): Promise<void> {
	const page = chrome.page;
	const noteText = `Frontend browser metrics ${Date.now()}`;

	await visitHome(page, baseUrl);
	await signupThroughUi(page, { username: 'alice', password: 'password', invitationCode });
	await closeUserSetupDialog(page);
	await postNote(page, noteText, 10_000);

	// 投稿直後の非同期処理が落ち着いてから計測したいので少し待つ
	await sleep(1000);
}
