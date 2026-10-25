/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import type { SsoProviderConfig } from '@/models/Meta.js';

/**
 * SSO プロバイダー一覧の版。管理画面が読み込んだ時点の一覧が、保存時点でも最新かを照合するために使う。
 * clientSecret の値は材料に含めない (設定済みかどうかだけ含める)。秘密は版からも復元できない。
 */
export function computeSsoProvidersRevision(providers: readonly SsoProviderConfig[]): string {
	const material = providers.map(p => [
		p.key,
		p.type,
		p.clientId,
		p.clientSecret != null && p.clientSecret !== '',
		p.issuerUrl ?? null,
		p.buttonLabel ?? null,
		p.enabled,
		p.trustUpstreamMfa ?? false,
	]);
	return createHash('sha256').update(JSON.stringify(material)).digest('hex');
}
