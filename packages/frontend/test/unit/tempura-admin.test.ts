/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, assert, describe, expect, test, vi } from 'vitest';
import { h, ref, type Component } from 'vue';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { directives } from '@/directives/index.js';
import { components } from '@/components/index.js';
import { DI } from '@/di.js';
import { i18n } from '@/i18n.js';
import { genSearchIndexes } from '@/utility/inapp-search.js';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sectionsDir = path.join(frontendRoot, 'src/pages/admin/tempura/sections');

const { apiMock, definePageMock, receivedMetaBySection, metaFixture } = vi.hoisted(() => ({
	apiMock: vi.fn((_endpoint: string) => Promise.resolve({})),
	definePageMock: vi.fn(),
	receivedMetaBySection: new Map<string, unknown>(),
	metaFixture: { name: 'TempuraTestInstance', version: '2026.11.0-tempura' },
}));

vi.mock('@/utility/misskey-api.js', async (importOriginal) => ({
	...(await importOriginal() as Record<string, unknown>),
	misskeyApi: apiMock,
}));
vi.mock('@/page.js', async (importOriginal) => ({
	...(await importOriginal() as Record<string, unknown>),
	definePage: definePageMock,
}));
// v-panel / MkFolder が参照するコンパイル済みテーマの最小モック
vi.mock('@/theme.js', async (importOriginal) => {
	const actual = await importOriginal() as Record<string, unknown>;
	const themeManager = (actual as { themeManager: Record<string, unknown> }).themeManager;
	return {
		...actual,
		themeManager: new Proxy(themeManager, {
			get(target, prop, receiver) {
				if (prop === 'currentCompiledTheme') return { panel: 'transparent' };
				return Reflect.get(target, prop, receiver);
			},
		}),
	};
});

const EXPECTED_CATEGORIES = [
	{
		markerId: 'tempuraAdminRegistration',
		label: () => i18n.ts._tempuraAdmin.groupRegistration,
		sections: [
			'ApprovalRequired',
			'DefaultRequireSigninToViewContents',
			'UsernameMinLength',
			'SecondsPerSignup',
			'SignupCodesSettings',
			'EmailDomainSettings',
			'DefaultFollowedUsers',
		],
	},
	{
		markerId: 'tempuraAdminFederation',
		label: () => i18n.ts._tempuraAdmin.groupFederation,
		sections: [
			'SignedApFetchSettings',
			'AnonymousAccessSettings',
			'ProxyAccountFollowModeSettings',
		],
	},
	{
		markerId: 'tempuraAdminModeration',
		label: () => i18n.ts._tempuraAdmin.groupModeration,
		sections: [
			'BlockMentions',
			'LlmModerationSettings',
			'LoginRiskSettings',
			'ContactFormSettings',
		],
	},
	{
		markerId: 'tempuraAdminIntegrations',
		label: () => i18n.ts._tempuraAdmin.groupIntegrations,
		sections: [
			'GeminiSettings',
			'DeeplFreeModeSettings',
			'ObjectStorageRemoteSettings',
		],
	},
	{
		markerId: 'tempuraAdminAppearance',
		label: () => i18n.ts._tempuraAdmin.groupAppearance,
		sections: [
			'LongIconUrl',
			'CustomSplashText',
			'EntranceSettings',
			'HanaEntranceSettings',
			'BackgroundImages',
			'CustomCursor',
			'BlockedUserImageSettings',
			'ServerStatsSettings',
			'OfflinePageSettings',
		],
	},
] as const;

const stubSectionModule = (name: string) => new Proxy({}, {
	get(_t, key) {
		if (key === 'default') {
			return {
				name,
				props: ['meta'],
				render(this: { meta: unknown }) {
					receivedMetaBySection.set(name, this.meta);
					return h('div', { 'data-stub-section': name });
				},
			};
		}
		if (key === '__esModule') return true;
		return undefined;
	},
	has: () => true,
	ownKeys: () => ['default', '__esModule'],
	getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

let cachedTempuraAdmin: Component | null = null;

async function loadTempuraAdminWithStubbedSections(): Promise<Component> {
	if (cachedTempuraAdmin != null) {
		return cachedTempuraAdmin;
	}

	const diskSections = fs.readdirSync(sectionsDir)
		.filter((file) => file.endsWith('.vue'))
		.map((file) => file.replace(/\.vue$/, ''));

	for (const name of diskSections) {
		vi.doMock(`@/pages/admin/tempura/sections/${name}.vue`, () => stubSectionModule(name));
	}

	const mod = await import('@/pages/admin/tempura-admin.vue');
	cachedTempuraAdmin = mod.default as Component;
	return cachedTempuraAdmin;
}

describe('テンプラ管理画面 (/admin/tempura-admin) カテゴリ構成と検索インデックス', () => {
	afterEach(() => {
		cleanup();
		apiMock.mockReset();
		definePageMock.mockReset();
		receivedMetaBySection.clear();
		vi.restoreAllMocks();
	});

	test('definePage が独自機能のタイトルとアイコンを登録し、全26セクションが5カテゴリへ重複・漏れなく配置されている', async () => {
		apiMock.mockResolvedValue(metaFixture);
		const XTempuraAdmin = await loadTempuraAdminWithStubbedSections();

		const page = render(XTempuraAdmin, {
			global: {
				directives,
				components,
				stubs: {
					PageWithHeader: { template: '<div><slot/></div>' },
				},
			},
		});

		expect(definePageMock).toHaveBeenCalledTimes(1);
		const pageDefFn = definePageMock.mock.calls[0][0] as () => { title: string; icon: string };
		expect(pageDefFn()).toEqual({
			title: i18n.ts.originalFeature,
			icon: 'ti ti-git-fork',
		});

		await vi.waitFor(() => {
			const headers = page.container.querySelectorAll('[data-testid="folder-header"]');
			assert.strictEqual(headers.length, EXPECTED_CATEGORIES.length, '5つのカテゴリMkFolderが描画される');
		});

		const folderRoots = [...page.container.querySelectorAll<HTMLElement>('[role="group"]')];
		assert.strictEqual(folderRoots.length, EXPECTED_CATEGORIES.length);

		const renderedSectionsAll: string[] = [];

		for (const [index, category] of EXPECTED_CATEGORIES.entries()) {
			const folderRoot = folderRoots[index];
			const header = folderRoot.querySelector<HTMLElement>('[data-testid="folder-header"]');
			assert.exists(header);

			expect(folderRoot.getAttribute('aria-expanded')).toBe('false');
			expect(header!.textContent).toContain(category.label());

			await fireEvent.click(header!);

			await vi.waitFor(() => {
				expect(folderRoot.getAttribute('aria-expanded')).toBe('true');
			});

			const renderedInCategory = [...folderRoot.querySelectorAll<HTMLElement>('[data-stub-section]')]
				.map((el) => el.getAttribute('data-stub-section')!);
			expect(renderedInCategory).toEqual([...category.sections]);

			for (const sectionName of renderedInCategory) {
				expect(receivedMetaBySection.get(sectionName)).toEqual(metaFixture);
			}
			renderedSectionsAll.push(...renderedInCategory);
		}

		const diskSections = fs.readdirSync(sectionsDir)
			.filter((file) => file.endsWith('.vue'))
			.map((file) => file.replace(/\.vue$/, ''))
			.sort();

		expect(new Set(renderedSectionsAll).size).toBe(renderedSectionsAll.length);
		expect([...renderedSectionsAll].sort()).toEqual(diskSections);
	});

	test('検索ターゲットが子セクションのとき該当カテゴリのMkFolderが初期状態で開き、子マーカー属性がDOMに付与される', async () => {
		const { searchIndexes: rawIndexes } = await import('search-index:admin');
		const indexed = genSearchIndexes(structuredClone(rawIndexes));
		const childSectionMarker = indexed.find((m) => m.parentId === 'tempuraAdminFederation');
		assert.exists(childSectionMarker, '連合・アクセス制御カテゴリ配下にセクションマーカーが存在する');

		apiMock.mockResolvedValue(metaFixture);
		const XTempuraAdmin = await loadTempuraAdminWithStubbedSections();

		const page = render(XTempuraAdmin, {
			global: {
				directives,
				components,
				stubs: {
					PageWithHeader: { template: '<div><slot/></div>' },
				},
				provide: {
					[DI.inAppSearchMarkerId as symbol]: ref(childSectionMarker!.id),
				},
			},
		});

		await vi.waitFor(() => {
			const folderRoots = [...page.container.querySelectorAll<HTMLElement>('[role="group"]')];
			assert.strictEqual(folderRoots.length, EXPECTED_CATEGORIES.length);
			expect(folderRoots[0].getAttribute('aria-expanded')).toBe('false');
			expect(folderRoots[1].getAttribute('aria-expanded')).toBe('true');
			expect(folderRoots[2].getAttribute('aria-expanded')).toBe('false');
			expect(folderRoots[3].getAttribute('aria-expanded')).toBe('false');
			expect(folderRoots[4].getAttribute('aria-expanded')).toBe('false');
		});

		const targetEl = page.container.querySelector(`[data-in-app-search-marker-id="${childSectionMarker!.id}"]`);
		assert.exists(targetEl, '子セクションに data-in-app-search-marker-id が自動付与されている');
	});

	test('search-index:admin が全32項目(ルート1+カテゴリ5+セクション26)を非循環・解決済みラベルで含む', async () => {
		const { searchIndexes: rawIndexes } = await import('search-index:admin');

		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const indexed = genSearchIndexes(structuredClone(rawIndexes));
		const failedInlines = logSpy.mock.calls.filter((args) => String(args[0]).includes('Failed to inline'));
		expect(failedInlines).toEqual([]);

		const byId = new Map(indexed.map((item) => [item.id, item]));
		const root = indexed.find((item) => item.path === '/admin/tempura-admin' && item.parentId == null);
		assert.exists(root, '/admin/tempura-admin のルートマーカーが存在する');
		expect(root!.icon).toBe('ti ti-git-fork');
		expect(root!.label).toBe(i18n.ts.originalFeature);

		const tempuraItems = [root!];

		for (const category of EXPECTED_CATEGORIES) {
			const catMarker = byId.get(category.markerId);
			assert.exists(catMarker, `カテゴリマーカー ${category.markerId} が存在する`);
			expect(catMarker!.parentId).toBe(root!.id);
			expect(catMarker!.path).toBe('/admin/tempura-admin');
			expect(catMarker!.label).toBe(category.label());
			expect(catMarker!.keywords.length).toBeGreaterThan(0);
			tempuraItems.push(catMarker!);

			const childMarkers = indexed.filter((item) => item.parentId === category.markerId);
			expect(childMarkers).toHaveLength(category.sections.length);
			for (const child of childMarkers) {
				expect(child.label.length).toBeGreaterThan(0);
				expect(child.label).not.toContain('${');
				tempuraItems.push(child);
			}
		}

		expect(tempuraItems).toHaveLength(1 + EXPECTED_CATEGORIES.length + 26);

		// 全マーカーから親を辿ったときに循環せず /admin/tempura-admin へ解決すること
		for (const item of tempuraItems) {
			const visited = new Set<string>([item.id]);
			let resolvedPath = item.path;
			let current = item.parentId ? byId.get(item.parentId) : undefined;
			while (current != null) {
				expect(visited.has(current.id)).toBe(false);
				visited.add(current.id);
				resolvedPath ??= current.path;
				current = current.parentId ? byId.get(current.parentId) : undefined;
			}
			expect(resolvedPath).toBe('/admin/tempura-admin');
		}
	});
});
