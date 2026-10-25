/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import bcrypt from 'bcryptjs';
import { describe, expect, test, vi } from 'vitest';
import { checkSsoReauth } from '@/server/api/sso-reauth.js';

describe('checkSsoReauth', () => {
	const hash = bcrypt.hashSync('pw');
	const mk = (twoFactorAuthenticate: (p: any, t: string) => Promise<void> = async () => {}) => ({ userAuthService: { twoFactorAuthenticate: vi.fn(twoFactorAuthenticate) } });

	test('パスワードが合えば通る (2FA なし)', async () => {
		expect(await checkSsoReauth(mk(), { password: hash, twoFactorEnabled: false }, { password: 'pw' })).toBe('ok');
	});

	test('パスワードが違う、またはパスワードが無いユーザーは通らず、2FA の確認にも進まない', async () => {
		const deps = mk();
		expect(await checkSsoReauth(deps, { password: hash, twoFactorEnabled: true }, { password: 'bad', token: '1' })).toBe('password');
		expect(await checkSsoReauth(deps, { password: null, twoFactorEnabled: true }, { password: 'pw', token: '1' })).toBe('password');
		expect(deps.userAuthService.twoFactorAuthenticate).not.toHaveBeenCalled();
	});

	test('2FA が有効ならコードが要り、誤りは通らない', async () => {
		expect(await checkSsoReauth(mk(), { password: hash, twoFactorEnabled: true }, { password: 'pw' })).toBe('twoFactor');
		expect(await checkSsoReauth(mk(async () => { throw new Error('x'); }), { password: hash, twoFactorEnabled: true }, { password: 'pw', token: 'bad' })).toBe('twoFactor');
		expect(await checkSsoReauth(mk(), { password: hash, twoFactorEnabled: true }, { password: 'pw', token: 'ok' })).toBe('ok');
	});
});
