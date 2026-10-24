/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { resolveSsoAdditionalAuthRequirement } from '@/server/api/SsoService.js';

describe('resolveSsoAdditionalAuthRequirement', () => {
	test('trustUpstreamMfa が true なら常に追加認証なし', () => {
		expect(resolveSsoAdditionalAuthRequirement({ twoFactorEnabled: true }, true, true)).toBe('none');
		expect(resolveSsoAdditionalAuthRequirement({ twoFactorEnabled: false }, true, true)).toBe('none');
		expect(resolveSsoAdditionalAuthRequirement(null, false, true)).toBe('none');
	});

	test('TOTP が有効なら TOTP を要求する (セキュリティキーがあっても TOTP 優先 = ローカルサインインと同一ポリシー)', () => {
		expect(resolveSsoAdditionalAuthRequirement({ twoFactorEnabled: true }, false, false)).toBe('totp');
		expect(resolveSsoAdditionalAuthRequirement({ twoFactorEnabled: true }, true, false)).toBe('totp');
	});

	test('TOTP 未設定でセキュリティキーがあればパスキーを要求する (ローカルのセキュリティキー必須ポリシーと同一)', () => {
		expect(resolveSsoAdditionalAuthRequirement({ twoFactorEnabled: false }, true, false)).toBe('passkey');
		expect(resolveSsoAdditionalAuthRequirement(null, true, false)).toBe('passkey');
	});

	test('TOTP もセキュリティキーもなければ追加認証なし', () => {
		expect(resolveSsoAdditionalAuthRequirement({ twoFactorEnabled: false }, false, false)).toBe('none');
		expect(resolveSsoAdditionalAuthRequirement(null, false, false)).toBe('none');
	});
});
