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

	test('TOTP 有効・セキュリティキーなしなら TOTP を要求する', () => {
		expect(resolveSsoAdditionalAuthRequirement({ twoFactorEnabled: true }, false, false)).toBe('totp');
	});

	test('TOTP 有効・セキュリティキーありならパスキーを提示する (TOTP は代替として引き続き受け付ける = ローカルサインインと同一ポリシー)', () => {
		expect(resolveSsoAdditionalAuthRequirement({ twoFactorEnabled: true }, true, false)).toBe('passkey');
	});

	test('セキュリティキーのみの登録では追加認証なし (ローカルでもパスワード単独でサインインできる)', () => {
		expect(resolveSsoAdditionalAuthRequirement({ twoFactorEnabled: false }, true, false)).toBe('none');
		expect(resolveSsoAdditionalAuthRequirement(null, true, false)).toBe('none');
	});

	test('TOTP もセキュリティキーもなければ追加認証なし', () => {
		expect(resolveSsoAdditionalAuthRequirement({ twoFactorEnabled: false }, false, false)).toBe('none');
		expect(resolveSsoAdditionalAuthRequirement(null, false, false)).toBe('none');
	});
});
