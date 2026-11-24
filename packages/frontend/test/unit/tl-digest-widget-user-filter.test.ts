/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { h, nextTick, provide, ref } from 'vue';
import { render, type RenderResult } from '@testing-library/vue';
import type { TlDigestController, TlDigestWindow } from '@/utility/tempura-script/tl-digest/digest.js';
import { PreferencesManager } from '@/preferences/manager.js';

// 件数確認の再計算はコントローラへの呼び出しとして観測する
vi.mock('@/utility/misskey-api.js', async (importOriginal) => ({
	...(await importOriginal() as Record<string, unknown>),
	misskeyApi: vi.fn(async () => []),
}));
// 件数確認はログイン中のアカウントの不在期間に対してだけ走る。
// $i を import する他のモジュール (権限判定など) が参照する最小限の形を返す
vi.mock('@/i.js', async (importOriginal) => ({
	...(await importOriginal() as Record<string, unknown>),
	$i: {
		id: 'test-user',
		username: 'tester',
		token: 'test-token',
		policies: {},
	},
}));

const { default: XTlDigestWidget } = await import('@/widgets/WidgetTlDigest.vue');
const { TL_DIGEST_CONTROLLER_KEY } = await import('@/utility/tempura-script/tl-digest/digest.js');

const WINDOW: TlDigestWindow = { since: 1_000, until: 2_000_000 };

/** 保存先もクラウド同期も持たない設定マネージャ。実際の設定キー・scope で値を動かす */
function createPreferences(): PreferencesManager {
	return new PreferencesManager({
		load: () => null,
		save: () => {},
		cloudGetBulk: async () => ({}),
		cloudGet: async () => null,
		cloudSet: async () => {},
	}, { id: 'test-user' });
}

type Recount = { win: TlDigestWindow; filter: { mode: string; ids: string[] } };

/**
 * 件数確認の呼び出しを記録するコントローラ。
 * 呼ばれた時点のユーザーフィルタ設定を控えるので、再計算が新しい設定で走ったことを確認できる。
 * 返す件数はその時点のフィルタ設定から決めるため、フィルタを緩めたときに
 * 件数が増えて「まとめる」が現れるかどうかを描画で確かめられる。
 */
function createCountingController(prefer: PreferencesManager): { controller: TlDigestController; recount: Recount[] } {
	const recount: Recount[] = [];
	const pendingCount = ref<TlDigestController['pendingCount']['value']>({ status: 'idle' });
	const controller = {
		result: ref(null),
		generating: ref(false),
		error: ref(null),
		pendingCount,
		pendingWindow: ref<TlDigestWindow | null>(WINDOW),
		refreshPendingCount: (win: TlDigestWindow) => {
			const filter = {
				mode: prefer.s.tlDigestUserFilterMode,
				ids: [...prefer.s.tlDigestUserFilterUserIds],
			};
			recount.push({ win, filter });
			// 制限の強い allow では対象が 0 件 (= 操作できる pending が出ない)、
			// 制限を外すと対象ノートが現れる、という実挙動を再現する
			const count = filter.mode === 'allow' ? 0 : 3;
			pendingCount.value = { status: 'ready', count, truncated: false };
			return Promise.resolve(pendingCount.value);
		},
		resetPendingCount: vi.fn(),
		run: () => Promise.resolve(),
		runRecent: () => Promise.resolve(),
		retry: () => Promise.resolve(),
		cancel: vi.fn(),
		clear: vi.fn(),
		dispose: vi.fn(),
	} as unknown as TlDigestController;
	return { controller, recount };
}

const settle = async (): Promise<void> => {
	for (let i = 0; i < 4; i++) {
		await nextTick();
		await Promise.resolve();
	}
};

describe('TLダイジェストウィジェットのユーザーフィルタ再計算', () => {
	let prefer: PreferencesManager;
	let page: RenderResult;
	let counting: ReturnType<typeof createCountingController>;

	beforeEach(async () => {
		prefer = createPreferences();
		const preferencesModule = await import('@/preferences.js');
		vi.spyOn(preferencesModule, 'prefer', 'get').mockReturnValue(prefer);
		counting = createCountingController(prefer);
	});

	afterEach(() => {
		page?.unmount();
		counting.controller.dispose();
		vi.restoreAllMocks();
	});

	const mountWidget = (): RenderResult => render({
		setup() {
			provide(TL_DIGEST_CONTROLLER_KEY, counting.controller);
			return () => h(XTlDigestWidget, { widget: { id: 'w1', data: {} } });
		},
	});

	test('初期表示では現在のフィルタ設定で数え直す', async () => {
		prefer.commit('tlDigestUserFilterMode', 'allow');
		prefer.commit('tlDigestUserFilterUserIds', ['u-mutual']);
		page = mountWidget();
		await settle();

		expect(counting.recount).toHaveLength(1);
		expect(counting.recount[0]).toMatchObject({ win: WINDOW, filter: { mode: 'allow', ids: ['u-mutual'] } });
	});

	test('allow で 0 件だった期間も、フィルタを外すと数え直して「まとめる」が出る', async () => {
		// 制限の強い allow では対象が 0 件なので、pending 行は出ない
		prefer.commit('tlDigestUserFilterMode', 'allow');
		prefer.commit('tlDigestUserFilterUserIds', ['u-mutual']);
		page = mountWidget();
		await settle();

		expect(counting.recount).toHaveLength(1);
		expect(counting.recount[0].filter.mode).toBe('allow');
		// 0 件なので操作できる pending は出ていない
		expect(page.queryByText('まとめる')).toBeNull();

		// フィルタを緩めると対象ノートが現れうるので、新しい設定で数え直す
		prefer.commit('tlDigestUserFilterMode', 'off');
		await settle();

		// 数え直しは新しい設定で走った (キャッシュされた古い結果を再利用していない)
		expect(counting.recount.map((r) => r.filter.mode)).toEqual(['allow', 'off']);
		expect(counting.recount.at(-1)!.filter).toEqual({ mode: 'off', ids: ['u-mutual'] });

		// 数え直した結果として「まとめる」が描画される
		expect(await page.findByText('まとめる')).toBeTruthy();
	});

	test('対象ユーザーの追加・削除でも数え直す', async () => {
		prefer.commit('tlDigestUserFilterMode', 'allow');
		prefer.commit('tlDigestUserFilterUserIds', ['u-mutual']);
		page = mountWidget();
		await settle();

		prefer.commit('tlDigestUserFilterUserIds', ['u-mutual', 'u-friend']);
		await settle();
		expect(counting.recount.at(-1)!.filter).toEqual({ mode: 'allow', ids: ['u-mutual', 'u-friend'] });

		const before = counting.recount.length;
		prefer.commit('tlDigestUserFilterUserIds', ['u-friend']);
		await settle();
		expect(counting.recount.length).toBeGreaterThan(before);
		expect(counting.recount.at(-1)!.filter).toEqual({ mode: 'allow', ids: ['u-friend'] });
	});

	test('対象件数に影響しない設定変更では数え直さない', async () => {
		page = mountWidget();
		await settle();
		const before = counting.recount.length;

		prefer.commit('tlDigestPrompt', 'keep it short');
		await settle();
		expect(counting.recount).toHaveLength(before);
	});
});
