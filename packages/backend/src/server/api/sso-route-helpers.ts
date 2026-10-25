/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getIpHash } from '@/misc/get-ip-hash.js';

type RateLimitOptions = { key: string; duration: number; max: number; minInterval?: number };

export type SsoRateLimiter = {
	limit: (limitation: RateLimitOptions, actor: string) => Promise<unknown>;
};

export type SsoReplyLike = {
	code: (status: number) => { send: (body: unknown) => unknown };
};

/**
 * SSO の生ルートは endpoint-meta のレート制限を通らないため、明示的に制限する。
 * 制限したら 429 を送って false を返す。送信した後に付けたヘッダーは応答に乗らないので、
 * Cookie の削除などは beforeReject で送信の前に行う
 */
export async function limitSsoRequest(
	deps: { enableIpRateLimit: boolean; rateLimiterService: SsoRateLimiter },
	request: { ip: string },
	reply: SsoReplyLike,
	key: string,
	opts?: { skipMinInterval?: boolean; beforeReject?: () => void },
): Promise<boolean> {
	if (!deps.enableIpRateLimit) return true;
	// 追加認証の送信 (TOTP/パスキー) は直前のチャレンジ取得に即座に続くため minInterval を適用しない。
	// 長期上限 (30回/10分/IP) は引き続き全リクエストに適用され、ブルートフォース耐性は維持される。
	const rateLimit = await deps.rateLimiterService.limit(
		opts?.skipMinInterval ? { key, duration: 10 * 60 * 1000, max: 30 } : { key, duration: 10 * 60 * 1000, max: 30, minInterval: 1000 },
		getIpHash(request.ip),
	);
	if (rateLimit != null) {
		opts?.beforeReject?.();
		reply.code(429).send({ error: { message: 'Rate limit exceeded. Try again later.', code: 'RATE_LIMIT_EXCEEDED', id: '7d0e1f2a-3b4c-4d5e-8f9a-0b1c2d3e4f5a' } });
		return false;
	}
	return true;
}

/**
 * パスキーの応答を検証する。verifyAuthentication はチャレンジ失効・未登録キー・検証失敗で例外を投げるため、
 * 例外も検証失敗 (false) として扱い、呼び出し側が失敗回数に数えられるようにする
 */
export async function verifyPasskeyForSso<C>(
	webAuthn: { verifyAuthentication: (userId: string, credential: C) => Promise<boolean> },
	userId: string,
	credential: C,
): Promise<boolean> {
	try {
		return await webAuthn.verifyAuthentication(userId, credential) === true;
	} catch {
		return false;
	}
}
