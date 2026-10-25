/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import bcrypt from 'bcryptjs';

/**
 * SSO の連携・解除での再認証。パスワードを先に確認し、2FA が有効ならコードも確認する。
 * パスワード不一致のまま 2FA の確認 (バックアップコードの消費を含む) に進まない。
 * パスワードが無いユーザーは通らない (閉め出す側に倒す)
 */
export async function checkSsoReauth(
	deps: { userAuthService: { twoFactorAuthenticate: (profile: any, token: string) => Promise<void> } },
	profile: { password: string | null; twoFactorEnabled: boolean },
	input: { password: string; token?: string | null },
): Promise<'ok' | 'password' | 'twoFactor'> {
	const passwordMatched = profile.password != null && await bcrypt.compare(input.password, profile.password);
	if (!passwordMatched) return 'password';

	if (profile.twoFactorEnabled) {
		if (input.token == null) return 'twoFactor';
		try {
			await deps.userAuthService.twoFactorAuthenticate(profile, input.token);
		} catch (_) {
			return 'twoFactor';
		}
	}
	return 'ok';
}
