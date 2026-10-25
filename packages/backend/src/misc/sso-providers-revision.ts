/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash, randomUUID } from 'node:crypto';
import type { SsoProviderConfig } from '@/models/Meta.js';

/**
 * SSO プロバイダー一覧の版。管理画面が読み込んだ時点の一覧が、保存時点でも最新かを照合するために使う。
 * 材料は各プロバイダーの key と rev (保存のたびに内容が変わったものだけ振り直す乱数) だけで、
 * clientSecret やそこから計算した値は含めない。値が変わった場合は rev が変わるので、秘密の更新も検出できる。
 */
export function computeSsoProvidersRevision(providers: readonly SsoProviderConfig[]): string {
	const material = providers.map(p => [p.key, p.rev ?? '']);
	return createHash('sha256').update(JSON.stringify(material)).digest('hex');
}

function sameContent(a: SsoProviderConfig, b: SsoProviderConfig): boolean {
	return a.type === b.type
		&& a.clientId === b.clientId
		&& a.clientSecret === b.clientSecret
		&& (a.issuerUrl ?? null) === (b.issuerUrl ?? null)
		&& (a.buttonLabel ?? null) === (b.buttonLabel ?? null)
		&& a.enabled === b.enabled
		&& (a.trustUpstreamMfa ?? false) === (b.trustUpstreamMfa ?? false);
}

/** 保存する一覧の各プロバイダーに rev を付ける。内容が変わっていなければ現在の rev を引き継ぎ、新規・変更は振り直す */
export function assignProviderRevisions(
	current: readonly SsoProviderConfig[],
	next: readonly SsoProviderConfig[],
	newRev: () => string = randomUUID,
): SsoProviderConfig[] {
	const currentByKey = new Map(current.map(p => [p.key, p]));
	return next.map(p => {
		const before = currentByKey.get(p.key);
		const rev = before != null && before.rev != null && sameContent(before, p) ? before.rev : newRev();
		return { ...p, rev };
	});
}
