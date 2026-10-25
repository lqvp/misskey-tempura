/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { computeSsoProvidersRevision } from '@/misc/sso-providers-revision.js';
import type { SsoProviderConfig } from '@/models/Meta.js';

const base: SsoProviderConfig = {
	key: 'main',
	type: 'oidc',
	clientId: 'id',
	clientSecret: 'super-secret-value',
	issuerUrl: 'https://idp.example.com',
	buttonLabel: null,
	enabled: true,
	trustUpstreamMfa: false,
};

describe('computeSsoProvidersRevision', () => {
	test('同じ内容なら同じ版になる', () => {
		expect(computeSsoProvidersRevision([base])).toBe(computeSsoProvidersRevision([{ ...base }]));
	});

	test('追加・削除・設定変更で版が変わる', () => {
		const r = computeSsoProvidersRevision([base]);
		expect(computeSsoProvidersRevision([])).not.toBe(r);
		expect(computeSsoProvidersRevision([base, { ...base, key: 'second' }])).not.toBe(r);
		expect(computeSsoProvidersRevision([{ ...base, trustUpstreamMfa: true }])).not.toBe(r);
		expect(computeSsoProvidersRevision([{ ...base, enabled: false }])).not.toBe(r);
	});

	test('clientSecret の値は版に影響せず、版から値も含まれない', () => {
		const r = computeSsoProvidersRevision([base]);
		expect(computeSsoProvidersRevision([{ ...base, clientSecret: 'another-secret' }])).toBe(r);
		expect(r).not.toContain('super-secret-value');
		expect(computeSsoProvidersRevision([{ ...base, clientSecret: '' }])).not.toBe(r);
	});
});
