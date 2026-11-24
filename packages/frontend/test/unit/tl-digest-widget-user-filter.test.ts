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
const { TL_DIGEST_CONTROLLER_KEY, claimTlDigestAutoGenerate } = await import('@/utility/tempura-script/tl-digest/digest.js');

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
function createCountingController(prefer: PreferencesManager): {
	controller: TlDigestController;
	recount: Recount[];
	/** 生成中 (generating) を外部から作るためのハンドル */
	generatingRef: ReturnType<typeof ref<boolean>>;
	/** run に渡されたオプション (onSending の到達性を確かめる) */
	runs: Array<Record<string, unknown>>;
	/** 進行中の run を完了させる (送信済み/未送信のタイミングを再現する) */
	finishRun: () => void;
} {
	const recount: Recount[] = [];
	const runs: Array<Record<string, unknown>> = [];
	const pendingCount = ref<TlDigestController['pendingCount']['value']>({ status: 'idle' });
	const generatingRef = ref(false);
	const runResolvers: Array<() => void> = [];
	const controller = {
		result: ref(null),
		generating: generatingRef,
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
		run: (opts: Record<string, unknown> = {}) => {
			runs.push(opts);
			// 実際の生成は await で戻るまで確保が残る。ここでは「まだ生成中」を再現するため、
			// 明示的に finishRun するまで resolve しない
			return new Promise<void>((resolve) => { runResolvers.push(resolve); });
		},
		runRecent: () => Promise.resolve(),
		retry: () => Promise.resolve(),
		cancel: vi.fn(),
		clear: vi.fn(),
		dispose: vi.fn(),
	} as unknown as TlDigestController;
	return {
		controller,
		recount,
		generatingRef,
		runs,
		finishRun: () => { for (const r of runResolvers.splice(0)) r(); },
	};
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

	const mountWidget = (data: Record<string, unknown> = {}): RenderResult => render({
		setup() {
			provide(TL_DIGEST_CONTROLLER_KEY, counting.controller);
			return () => h(XTlDigestWidget, { widget: { id: 'w1', data } });
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

describe('TLダイジェストウィジェットの自動生成の確保とキャンセル', () => {
	let page: RenderResult | null = null;

	beforeEach(async () => {
		const prefer = createPreferences();
		const preferencesModule = await import('@/preferences.js');
		vi.spyOn(preferencesModule, 'prefer', 'get').mockReturnValue(prefer);
	});

	afterEach(() => {
		page?.unmount();
		page = null;
		vi.restoreAllMocks();
	});

	/**
	 * generating 行のキャンセルボタンを押す。
	 * 文言はテスト環境のロケール (en-US) に依存するため、テキストではなく
	 * 生成中行にある唯一のボタンであることを手がかりにする
	 */
	async function clickCancel(): Promise<void> {
		const buttons = page!.container.querySelectorAll('button');
		// ヘッダーの設定ボタンの次に来る、生成中行の「キャンセル」が対象
		const cancel = Array.from(buttons).find((b) => b.textContent?.trim() === 'Cancel' || b.textContent?.trim() === 'キャンセル');
		expect(cancel).toBeTruthy();
		cancel!.click();
		await settle();
	}

	/** 自動生成の対象になる不在期間を控える */
	const windowOf = (run: Record<string, unknown>) => ({ since: run.since as number, until: run.until as number });

	/** 自動生成を 1 回走らせ、進行中の (未送信の) 状態で返す */
	async function startAutoGeneration(): Promise<ReturnType<typeof createCountingController>> {
		const prefer = createPreferences();
		const counting = createCountingController(prefer);
		page = render({
			setup() {
				provide(TL_DIGEST_CONTROLLER_KEY, counting.controller);
				return () => h(XTlDigestWidget, { widget: { id: 'w2', data: { autoGenerate: true } } });
			},
		});
		await settle();
		expect(counting.runs).toHaveLength(1);
		return counting;
	}

	test('送信前のキャンセルは自動生成の確保を解放し、同じ不在期間を再度確保できる', async () => {
		const counting = await startAutoGeneration();
		const win = windowOf(counting.runs[0]);
		// 生成中なので確保はまだ保持されている (キャンセルで解放される対象)
		expect(claimTlDigestAutoGenerate('test-user', win)).toBeNull();

		counting.generatingRef.value = true;
		await settle();
		await clickCancel();
		await settle();

		expect(counting.controller.cancel).toHaveBeenCalledTimes(1);
		// 送信前に中断したので、開き直したとき同じ期間の自動生成を再試行できる
		const again = claimTlDigestAutoGenerate('test-user', win);
		expect(again).not.toBeNull();
		again!();
	});

	test('送信後 (onSending 到達) にキャンセルしても確保は消費されたまま復活しない', async () => {
		const counting = await startAutoGeneration();
		const win = windowOf(counting.runs[0]);
		// run 側で「実際に送信した」ことが起きた状態を再現する
		(counting.runs[0].onSending as () => void)();

		counting.generatingRef.value = true;
		await settle();
		await clickCancel();
		await settle();

		expect(counting.controller.cancel).toHaveBeenCalledTimes(1);
		// 送信済みの期間はキャンセルでは復活しない
		expect(claimTlDigestAutoGenerate('test-user', win)).toBeNull();
	});
});
