/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll } from 'vitest';
import { initTestDb, sendEnvResetRequest, sendEnvStartRequest } from './utils.js';

beforeAll(async () => {
	// 前ファイルのNestJSアプリをdispose(env-reset) → スキーマdrop & 再作成 → 起動(env-start) の順。
	// dispose前にdropすると前ファイルの投げっぱなし非同期処理がUnhandled Rejectionになる。
	// 起動は必ずdropの完了後(paired: env-resetは停止のみ)。
	await sendEnvResetRequest();
	await initTestDb(false);
	await sendEnvStartRequest();
});
