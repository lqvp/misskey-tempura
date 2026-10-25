/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { assignProviderRevisions, computeSsoProvidersRevision } from '@/misc/sso-providers-revision.js';
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
	rev: 'rev-1',
};

describe('computeSsoProvidersRevision', () => {
	test('同じ内容なら同じ版になり、追加・削除・rev の変更で変わる', () => {
		const r = computeSsoProvidersRevision([base]);
		expect(computeSsoProvidersRevision([{ ...base }])).toBe(r);
		expect(computeSsoProvidersRevision([])).not.toBe(r);
		expect(computeSsoProvidersRevision([base, { ...base, key: 'second' }])).not.toBe(r);
		expect(computeSsoProvidersRevision([{ ...base, rev: 'rev-2' }])).not.toBe(r);
	});

	test('版は clientSecret の値と無関係で、値を含まない', () => {
		const r = computeSsoProvidersRevision([base]);
		expect(computeSsoProvidersRevision([{ ...base, clientSecret: 'another-secret' }])).toBe(r);
		expect(r).not.toContain('super-secret-value');
	});
});

describe('assignProviderRevisions', () => {
	let n = 0;
	const newRev = () => `new-${++n}`;

	test('内容が同じなら現在の rev を引き継ぐ', () => {
		const out = assignProviderRevisions([base], [{ ...base, rev: undefined }], newRev);
		expect(out[0].rev).toBe('rev-1');
	});

	test('新規のプロバイダーと、clientSecret を含む内容が変わったものは rev を振り直す', () => {
		const out = assignProviderRevisions([base], [
			{ ...base, clientSecret: 'rotated' },
			{ ...base, key: 'second' },
		], newRev);
		expect(out[0].rev).not.toBe('rev-1');
		expect(out[1].rev).not.toBe('rev-1');
		expect(out[0].rev).not.toBe(out[1].rev);
	});

	test('rev を持たない既存の設定は、内容が同じでも rev を付ける', () => {
		const out = assignProviderRevisions([{ ...base, rev: undefined }], [base], newRev);
		expect(out[0].rev).toMatch(/^new-/);
	});
});
