/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiMeta } from '@/models/_.js';

/**
 * 監査ログ(モデレーションログ)に残すメタ設定から SSO の clientSecret を除く。
 * 値は管理者 API (admin/show-moderation-logs) から読めてしまうため残さず、設定の有無だけ hasClientSecret で残す。
 * 保存する設定そのものは変更しない(元のオブジェクトは書き換えない)
 */
export function redactMetaForModerationLog<T extends Pick<MiMeta, 'ssoProviders'>>(meta: T): Omit<T, 'ssoProviders'> & { ssoProviders: Record<string, unknown>[] } {
	return {
		...meta,
		ssoProviders: (meta.ssoProviders ?? []).map(provider => {
			const { clientSecret, ...rest } = provider;
			return { ...rest, hasClientSecret: clientSecret != null && clientSecret !== '' };
		}),
	};
}
