<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer
	:showHeader="widgetProps.showHeader"
	:naked="widgetProps.transparent"
	:thin="true"
	class="mkw-tlDigest"
>
	<template #icon>
		<span :class="$style.iconWrap">
			<i class="ti ti-sparkles" aria-hidden="true"></i>
			<span v-if="showPendingState" :class="$style.pendingDot" aria-hidden="true"></span>
		</span>
	</template>
	<template #header>{{ i18n.ts._widgets.tlDigest }}</template>
	<template #func="{ buttonStyleClass }">
		<button
			type="button"
			class="_button"
			:class="buttonStyleClass"
			:aria-label="i18n.ts.settings"
			:title="i18n.ts.settings"
			@click="configure()"
		>
			<i class="ti ti-settings" aria-hidden="true"></i>
		</button>
	</template>

	<div :class="$style.root" class="_selectable">
		<!-- 状態の変化だけを短く読み上げる (トピック全文は読み上げない) -->
		<div role="status" aria-live="polite" :class="$style.srOnly">{{ liveMessage }}</div>

		<!-- 1. generating -->
		<div v-if="digestGenerating" :class="$style.statusRow">
			<div :class="$style.generatingInfo">
				<MkLoading :em="true" :colored="true"/>
				<span>{{ i18n.ts._tlDigest.generating }}</span>
			</div>
			<button type="button" class="_button" :class="$style.subAction" @click="controller.cancel()">
				{{ i18n.ts.cancel }}
			</button>
		</div>

		<!-- 2. error -->
		<div v-else-if="digestError != null" :class="$style.errorBox">
			<div :class="$style.errorText" role="alert">
				<i class="ti ti-alert-triangle" aria-hidden="true"></i>
				<span>{{ digestError.message }}</span>
			</div>
			<div :class="$style.actionRow">
				<MkA v-if="digestError.isConfigError" to="/settings/tempura-settings" :class="$style.linkChip">
					{{ i18n.ts._tlDigest.openLlmSettings }}
				</MkA>
				<button type="button" class="_button" :class="$style.primaryAction" @click="onRetry()">
					{{ i18n.ts.retry }}
				</button>
				<button
					type="button"
					class="_button"
					:class="$style.iconAction"
					:aria-label="i18n.ts.close"
					:title="i18n.ts.close"
					@click="controller.clear()"
				>
					<i class="ti ti-x" aria-hidden="true"></i>
				</button>
			</div>
		</div>

		<!-- 3. result -->
		<div v-else-if="latestDigestResult != null" :class="$style.resultBox">
			<div v-if="latestDigestResult.noteCount === 0" :class="$style.emptyTopics">
				{{ latestDigestResult.scanTruncated ? i18n.ts._tlDigest.noNotesInScannedRange : i18n.ts._tlDigest.noNotesToSummarize }}
			</div>
			<div v-else-if="latestDigestResult.topics.length > 0" :class="$style.topicList">
				<div v-for="(topic, idx) in latestDigestResult.topics" :key="idx" :class="$style.topicCard">
					<div :class="$style.topicTitle">{{ topic.title }}</div>
					<div v-if="topic.summary" :class="$style.topicSummary">{{ topic.summary }}</div>
					<div v-if="topic.refs.length > 0" :class="$style.refList">
						<MkA
							v-for="refItem in topic.refs"
							:key="refItem.noteId"
							:to="`/notes/${refItem.noteId}`"
							:class="$style.refChip"
						>
							<i class="ti ti-note" aria-hidden="true"></i>
							<span>{{ refItem.username }}</span>
						</MkA>
					</div>
				</div>
			</div>
			<div v-else-if="latestDigestResult.fallbackText" :class="$style.fallbackBox">
				{{ latestDigestResult.fallbackText }}
			</div>
			<div v-else :class="$style.emptyTopics">
				{{ i18n.ts._tlDigest.noTopics }}
			</div>

			<div :class="$style.resultFooter">
				<div v-if="latestDigestResult.noteCount > 0" :class="$style.footerMeta">
					{{ i18n.tsx._tlDigest.resultFooter({
						count: latestDigestResult.noteCount,
						time: formatTime(latestDigestResult.generatedAt),
					}) }}
				</div>
				<div :class="$style.actionRow">
					<button type="button" class="_button" :class="$style.subAction" @click="onRetry()">
						<i class="ti ti-refresh" aria-hidden="true"></i>
						<span>{{ i18n.ts._tlDigest.regenerate }}</span>
					</button>
					<button type="button" class="_button" :class="$style.subAction" @click="controller.clear()">
						{{ i18n.ts.close }}
					</button>
				</div>
			</div>
		</div>

		<!-- 4. pending (counting / count failed / ready) -->
		<div v-else-if="pendingView != null" :class="$style.statusRow">
			<div :class="$style.pendingText">
				<MkLoading v-if="pendingView === 'counting'" :em="true" :colored="false"/>
				<span v-else-if="!widgetProps.showHeader" :class="$style.inlineDot" aria-hidden="true"></span>
				<span :class="pendingView === 'counting' ? $style.countingText : undefined">{{ pendingSummaryText }}</span>
			</div>
			<div :class="$style.actionRow">
				<button
					v-if="pendingView === 'error'"
					type="button"
					class="_button"
					:class="$style.subAction"
					@click="refreshPending()"
				>
					{{ i18n.ts.retry }}
				</button>
				<button
					v-if="pendingView !== 'counting'"
					type="button"
					class="_button _buttonPrimary"
					:class="$style.primaryBtn"
					@click="onSummarizePending()"
				>
					{{ i18n.ts._tlDigest.summarizeAction }}
				</button>
				<button
					type="button"
					class="_button"
					:class="$style.iconAction"
					:aria-label="i18n.ts.close"
					:title="i18n.ts.close"
					@click="onDismissPending()"
				>
					<i class="ti ti-x" aria-hidden="true"></i>
				</button>
			</div>
		</div>

		<!-- 5. idle -->
		<div v-else :class="$style.statusRow">
			<span :class="$style.idleText">{{ i18n.ts._tlDigest.idleMessage }}</span>
			<button type="button" class="_button" :class="$style.subAction" @click="onSummarizeRecent()">
				{{ i18n.ts._tlDigest.summarizeRecent }}
			</button>
		</div>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { computed, inject, onBeforeUnmount, watch } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import { widgetPreviewContext } from './widget-preview.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import type { TlDigestPendingCount, TlDigestWindow } from '@/utility/tempura-script/tl-digest/digest.js';
import MkContainer from '@/components/MkContainer.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { prefer } from '@/preferences.js';
import {
	dismissTlDigestPending,
	getActivePendingWindow,
	pendingSinceRef,
	pendingUntilRef,
} from '@/utility/tempura-script/tl-digest/activity.js';
import {
	claimTlDigestAutoGenerate,
	createTlDigestController,
	TL_DIGEST_CONTROLLER_KEY,
	TL_DIGEST_CONTROLLER_STORE_KEY,
} from '@/utility/tempura-script/tl-digest/digest.js';

const name = 'tlDigest';

const widgetPropsDef = {
	showHeader: {
		type: 'boolean' as const,
		label: i18n.ts._widgetOptions.showHeader,
		default: true,
	},
	transparent: {
		type: 'boolean' as const,
		label: i18n.ts._widgetOptions.transparent,
		default: false,
	},
	absenceThreshold: {
		type: 'radio' as const,
		label: i18n.ts._tlDigest._widgetOptions.absenceThreshold,
		default: '60' as const,
		options: [
			{ value: '30' as const, label: i18n.ts._tlDigest._widgetOptions.threshold30m },
			{ value: '60' as const, label: i18n.ts._tlDigest._widgetOptions.threshold1h },
			{ value: '180' as const, label: i18n.ts._tlDigest._widgetOptions.threshold3h },
			{ value: '360' as const, label: i18n.ts._tlDigest._widgetOptions.threshold6h },
		],
	},
	maxNotes: {
		type: 'radio' as const,
		label: i18n.ts._tlDigest._widgetOptions.maxNotes,
		default: '100' as const,
		options: [
			{ value: '50' as const, label: i18n.tsx._tlDigest._widgetOptions.notesCount({ count: 50 }) },
			{ value: '100' as const, label: i18n.tsx._tlDigest._widgetOptions.notesCount({ count: 100 }) },
			{ value: '200' as const, label: i18n.tsx._tlDigest._widgetOptions.notesCount({ count: 200 }) },
		],
	},
	includeRenotes: {
		type: 'boolean' as const,
		label: i18n.ts._tlDigest._widgetOptions.includeRenotes,
		default: true,
	},
	autoGenerate: {
		type: 'boolean' as const,
		label: i18n.ts._tlDigest._widgetOptions.autoGenerate,
		description: i18n.ts._tlDigest._widgetOptions.autoGenerateDescription,
		default: false,
	},
} satisfies FormWithDefault;

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure } = useWidgetPropsManager(name, widgetPropsDef, props, emit);

// 生成結果・件数・エラーはウィジェットごとに持つ (複数設置しても干渉しない)。
// Storybook などから状態を差し込む場合だけ inject を使う
const injectedController = inject(TL_DIGEST_CONTROLLER_KEY, null);
// 設定ダイアログのプレビューは未保存の設定で描画されるため、LLM への送信とお知らせの消化を行わない
const isPreview = inject(widgetPreviewContext, undefined) != null;
// ネストウィジェット内では切り替えでアンマウントされても結果を保てるよう、親が持つストアの状態を使う
const controllerStore = isPreview || props.widget == null ? null : inject(TL_DIGEST_CONTROLLER_STORE_KEY, null);
const ownsController = injectedController == null && controllerStore == null;
const controller = injectedController ?? controllerStore?.get(props.widget!.id) ?? createTlDigestController(isPreview ? {
	generate: () => Promise.reject(new Error(i18n.ts._llm._error.cancel)),
	dismissPending: () => {},
} : {});
const {
	result: latestDigestResult,
	generating: digestGenerating,
	error: digestError,
	pendingCount,
} = controller;

// 送信前の自動生成の確保 (自動生成は同じ不在期間につき 1 回だけなので、
// 送信前に中断した場合は確保を解放して、開き直したときに再度自動生成できるようにする)。
//
// 状態の遷移は必ず次のどちらかで終える:
//   - 送信済み (onSending が呼ばれた): この期間は消費済みなので解放しない
//   - 送信前に終了 (キャンセル / エラー / 0 件など): 解放して次の機会に再試行できるようにする
// onSending は controller.run 側で「設定の再確認を通過し、実際に送信した」時だけ呼ばれる。
let releaseUnsentAutoGenerate: (() => void) | null = null;

/** 未送信の確保を解放する (送信済みなら null になっているので何もしない) */
function releaseUnsentAutoGenerateClaim(): void {
	const release = releaseUnsentAutoGenerate;
	releaseUnsentAutoGenerate = null;
	release?.();
}

let disposed = false;
onBeforeUnmount(() => {
	disposed = true;
	// アンマウント時点で確保が残っているのは「まだ送信していない」場合だけ。
	// キャンセルボタンはウィジェットを閉じる (= アンマウント) ので、キャンセルで中断した自動生成もここで解放され、
	// 開き直したときに同じ不在期間の自動生成を再試行できる。
	// 送信済みなら onSending で null になっているため、消費した期間が復活することはない。
	releaseUnsentAutoGenerateClaim();
	if (ownsController) controller.dispose();
});

const thresholdMinutes = computed(() => Number(widgetProps.absenceThreshold) || 60);
const maxNotesCount = computed(() => Number(widgetProps.maxNotes) || 100);

const activePending = computed(() => {
	if (controller.pendingWindow != null) {
		return controller.pendingWindow.value;
	}
	void pendingSinceRef.value;
	void pendingUntilRef.value;
	return getActivePendingWindow(thresholdMinutes.value);
});

/** pending 行の表示モード (表示しない場合は null) */
const pendingView = computed<'counting' | 'error' | 'ready' | null>(() => {
	if (activePending.value == null) return null;
	const state = pendingCount.value;
	if (state.status === 'counting') return 'counting';
	if (state.status === 'error') return 'error';
	// 走査上限で打ち切った 0 件は「全期間 0 件」と区別して表示する
	if (state.status === 'ready' && (state.count > 0 || state.truncated)) return 'ready';
	return null;
});

// ヘッダーのドットは「操作できるお知らせ」があるときだけ出す
const showPendingState = computed(() => pendingView.value === 'ready' || pendingView.value === 'error');

function formatDuration(ms: number): string {
	const totalMinutes = Math.max(1, Math.round(ms / 60_000));
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours > 0 && minutes > 0) {
		return i18n.tsx._tlDigest.durationHoursMinutes({ hours, minutes });
	}
	if (hours > 0) {
		return i18n.tsx._tlDigest.durationHours({ hours });
	}
	return i18n.tsx._tlDigest.durationMinutes({ minutes: totalMinutes });
}

function formatTime(timestamp: number): string {
	const d = new Date(timestamp);
	const h = String(d.getHours()).padStart(2, '0');
	const m = String(d.getMinutes()).padStart(2, '0');
	return `${h}:${m}`;
}

const pendingSummaryText = computed(() => {
	const win = activePending.value;
	if (win == null) return '';
	const duration = formatDuration(win.until - win.since);
	const state = pendingCount.value;
	if (state.status === 'counting') return i18n.tsx._tlDigest.pendingCounting({ duration });
	if (state.status === 'error') return i18n.tsx._tlDigest.pendingCountFailed({ duration });
	if (state.status === 'ready' && state.truncated) {
		return state.count === 0
			? i18n.tsx._tlDigest.pendingSummaryTruncatedZero({ duration })
			: i18n.tsx._tlDigest.pendingSummaryTruncated({ duration, count: state.count });
	}
	const count = state.status === 'ready' ? state.count : 0;
	return i18n.tsx._tlDigest.pendingSummary({ duration, count });
});

const liveMessage = computed(() => {
	if (digestGenerating.value) return i18n.ts._tlDigest.generating;
	if (digestError.value != null) return '';
	if (latestDigestResult.value != null) {
		if (latestDigestResult.value.noteCount === 0) {
			return latestDigestResult.value.scanTruncated
				? i18n.ts._tlDigest.noNotesInScannedRange
				: i18n.ts._tlDigest.noNotesToSummarize;
		}
		return i18n.tsx._tlDigest.resultFooter({
			count: latestDigestResult.value.noteCount,
			time: formatTime(latestDigestResult.value.generatedAt),
		});
	}
	if (pendingView.value === 'ready' || pendingView.value === 'error') return pendingSummaryText.value;
	return '';
});

function isSameWindow(a: TlDigestWindow | null, b: TlDigestWindow): boolean {
	return a != null && a.since === b.since && a.until === b.until;
}

function maybeAutoGenerate(win: TlDigestWindow, includeRenotes: boolean, state: TlDigestPendingCount): void {
	// 件数確認の await 中に条件が変わっていたら、古い条件では送信しない
	if (isPreview || disposed || !isSameWindow(activePending.value, win)) return;
	if (widgetProps.includeRenotes !== includeRenotes || !widgetProps.autoGenerate) return;
	if (state.status !== 'ready' || state.count === 0) return;
	if (digestGenerating.value || latestDigestResult.value != null) return;
	// 自動生成は同じ不在期間につき 1 回だけ (複数設置時や失敗後の設定変更で再送しない)
	const release = claimTlDigestAutoGenerate($i?.id ?? null, win);
	if (release == null) return;
	releaseUnsentAutoGenerate = release;
	void controller.run({
		since: win.since,
		until: win.until,
		maxNotes: maxNotesCount.value,
		includeRenotes,
		onSending: () => {
			// 実際に送信した時点でこの期間は消費済みにする (以後の finally では解放しない)
			releaseUnsentAutoGenerate = null;
		},
	}).finally(() => {
		// run はキャンセル・エラー・0 件でも resolve する。送信前に終わった場合は確保を解放し、
		// ドロワーを開き直したときや設定を直した後に再試行できるようにする。
		// 送信済みなら onSending で null になっているので解放されない
		if (releaseUnsentAutoGenerate === release) releaseUnsentAutoGenerateClaim();
	});
}

async function refreshPending(): Promise<void> {
	const win = activePending.value;
	const includeRenotes = widgetProps.includeRenotes;
	if (win == null || !$i) {
		controller.resetPendingCount();
		return;
	}
	const state = await controller.refreshPendingCount(win, includeRenotes);
	if (state == null) return; // より新しい確認に置き換えられた
	maybeAutoGenerate(win, includeRenotes, state);
}

// followers が有効な場合、LLM の送信先設定変更でも対象件数を再計算する
const followersDestinationTrigger = computed(() => {
	if (!prefer.r.tlDigestVisibilities.value.includes('followers')) return '';
	return `${prefer.r.useGeminiLLMAPI.value}:${prefer.r.openaiBaseUrl.value ?? ''}:${prefer.r.openaiToken.value?.trim() ? '1' : '0'}`;
});

// 対象件数に影響する設定 (公開範囲・CW・followers 同意/送信先・ユーザーフィルタ) が変わったときも数え直す
watch(
	[
		activePending,
		() => widgetProps.includeRenotes,
		prefer.r.tlDigestVisibilities,
		prefer.r.tlDigestCwMode,
		prefer.r.tlDigestFollowersConsent,
		// フィルタを緩めると 0 件だった期間にノートが現れるため、変更時は必ず数え直す
		// (件数確認のキャッシュキーは digest.ts の resolveFilter がフィルタを含むので古い結果は再利用されない)
		prefer.r.tlDigestUserFilterMode,
		prefer.r.tlDigestUserFilterUserIds,
		followersDestinationTrigger,
	],
	() => {
		void refreshPending();
	},
	{ immediate: true },
);

// 既に件数確認済みの pending がある状態で自動生成を ON にしたときも発火させる
watch(
	() => widgetProps.autoGenerate,
	(enabled) => {
		if (!enabled || activePending.value == null) return;
		maybeAutoGenerate(activePending.value, widgetProps.includeRenotes, pendingCount.value);
	},
);

// 前回の結果を閉じた時点で新しい期間の件数確認が完了していれば自動生成を再評価する
watch(
	latestDigestResult,
	(next, prev) => {
		if (next != null || prev == null || activePending.value == null) return;
		maybeAutoGenerate(activePending.value, widgetProps.includeRenotes, pendingCount.value);
	},
);

function onSummarizePending(): void {
	const win = activePending.value;
	if (win == null) return;
	void controller.run({
		since: win.since,
		until: win.until,
		maxNotes: maxNotesCount.value,
		includeRenotes: widgetProps.includeRenotes,
	});
}

function onDismissPending(): void {
	if (isPreview) return;
	dismissTlDigestPending($i?.id ?? null, activePending.value);
}

function onSummarizeRecent(): void {
	void controller.runRecent(maxNotesCount.value, widgetProps.includeRenotes);
}

function onRetry(): void {
	// 期間だけ引き継ぎ、件数・RN は現在のウィジェット設定を使う
	void controller.retry(maxNotesCount.value, widgetProps.includeRenotes);
}

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" module>
.root {
	position: relative;
	padding: 10px 12px;
	font-size: 0.9em;
}

.srOnly {
	position: absolute;
	width: 1px;
	height: 1px;
	margin: -1px;
	padding: 0;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}

.iconWrap {
	position: relative;
	display: inline-flex;
	align-items: center;
}

.pendingDot {
	position: absolute;
	top: -2px;
	right: -4px;
	width: 7px;
	height: 7px;
	border-radius: 999px;
	background: var(--MI_THEME-accent);
}

.inlineDot {
	display: inline-block;
	width: 7px;
	height: 7px;
	border-radius: 999px;
	background: var(--MI_THEME-accent);
	margin-right: 6px;
	flex-shrink: 0;
}

.statusRow {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px 8px;
	min-height: 26px;
}

.generatingInfo {
	display: flex;
	align-items: center;
	gap: 8px;
	color: var(--MI_THEME-fg);
	font-size: 0.92em;
}

.idleText {
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.7);
	font-size: 0.92em;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.pendingText {
	display: flex;
	align-items: center;
	font-weight: 600;
	color: var(--MI_THEME-fg);
	font-size: 0.92em;
	min-width: 0;
}

.countingText {
	margin-left: 6px;
	font-weight: normal;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.7);
}

.actionRow {
	display: flex;
	align-items: center;
	gap: 6px;
	flex-shrink: 0;
}

.primaryBtn {
	padding: 4px 10px;
	border-radius: 999px;
	font-size: 0.85em;
	font-weight: 600;
	line-height: 1.4;
}

.primaryAction,
.subAction,
.linkChip {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 4px 9px;
	border-radius: 999px;
	font-size: 0.85em;
	line-height: 1.4;
	background: var(--MI_THEME-buttonBg);
	color: var(--MI_THEME-fg);
	text-decoration: none;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.primaryAction {
	color: var(--MI_THEME-accent);
	font-weight: 600;
}

.iconAction {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	border-radius: 999px;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.7);

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
		color: var(--MI_THEME-fg);
	}
}

.errorBox {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.errorText {
	display: flex;
	align-items: flex-start;
	gap: 6px;
	color: var(--MI_THEME-warn);
	font-size: 0.9em;
	line-height: 1.4;
}

.resultBox {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.topicList {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.topicCard {
	padding: 8px 10px;
	border-radius: var(--MI-radius);
	background: color(from var(--MI_THEME-fg) srgb r g b / 0.04);
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.topicTitle {
	font-weight: 700;
	font-size: 0.95em;
	color: var(--MI_THEME-fgHighlighted);
	line-height: 1.35;
}

.topicSummary {
	font-size: 0.88em;
	color: var(--MI_THEME-fg);
	line-height: 1.45;
	white-space: pre-wrap;
}

.refList {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	padding-top: 2px;
}

.refChip {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	padding: 2px 7px;
	border-radius: 999px;
	font-size: 0.78em;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	text-decoration: none;
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;

	&:hover {
		text-decoration: underline;
	}
}

.fallbackBox {
	padding: 8px 10px;
	border-radius: var(--MI-radius);
	background: color(from var(--MI_THEME-fg) srgb r g b / 0.04);
	font-size: 0.88em;
	line-height: 1.5;
	white-space: pre-wrap;
}

.emptyTopics {
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.7);
	font-size: 0.88em;
	padding: 4px 0;
}

.resultFooter {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-top: 6px;
	border-top: 1px solid var(--MI_THEME-divider);
}

.footerMeta {
	font-size: 0.78em;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.65);
	line-height: 1.35;
}
</style>
