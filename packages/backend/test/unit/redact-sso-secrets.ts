/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { redactMetaForModerationLog } from '@/misc/redact-sso-secrets.js';

const provider = (over: Record<string, unknown> = {}) => ({
	key: 'authentik',
	type: 'oidc' as const,
	clientId: 'client-id',
	clientSecret: 'synthetic-secret-value',
	issuerUrl: 'https://idp.example.com/',
	buttonLabel: null,
	enabled: true,
	trustUpstreamMfa: false,
	...over,
});

describe('redactMetaForModerationLog', () => {
	it('clientSecret を除き、有無だけ hasClientSecret で残す', () => {
		const out = redactMetaForModerationLog({ name: 'x', ssoProviders: [provider(), provider({ key: 'empty', clientSecret: '' })] } as any);
		expect(JSON.stringify(out)).not.toContain('synthetic-secret-value');
		expect(out.ssoProviders[0]).toMatchObject({ key: 'authentik', clientId: 'client-id', hasClientSecret: true });
		expect(out.ssoProviders[0]).not.toHaveProperty('clientSecret');
		expect(out.ssoProviders[1]).toMatchObject({ key: 'empty', hasClientSecret: false });
		expect((out as any).name).toBe('x');
	});

	it('元の設定は書き換えない(保存・空欄時保持に影響しない)', () => {
		const meta = { ssoProviders: [provider()] } as any;
		redactMetaForModerationLog(meta);
		expect(meta.ssoProviders[0].clientSecret).toBe('synthetic-secret-value');
	});

	it('ssoProviders が空でも動く', () => {
		expect(redactMetaForModerationLog({ ssoProviders: [] } as any).ssoProviders).toEqual([]);
	});
});
