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
			<i class="ti ti-sparkles"></i>
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
			<i class="ti ti-settings"></i>
		</button>
	</template>

	<div :class="$style.root" class="_selectable">
		<!-- 1. generating -->
		<div v-if="digestGenerating" :class="$style.statusRow">
			<div :class="$style.generatingInfo">
				<MkLoading :inline="true" :colored="true"/>
				<span>{{ i18n.ts._tlDigest.generating }}</span>
			</div>
			<button type="button" class="_button" :class="$style.subAction" @click="cancelTlDigest()">
				{{ i18n.ts.cancel }}
			</button>
		</div>

		<!-- 2. error -->
		<div v-else-if="digestError != null" :class="$style.errorBox">
			<div :class="$style.errorText">
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
					@click="clearTlDigestResult()"
				>
					<i class="ti ti-x"></i>
				</button>
			</div>
		</div>

		<!-- 3. result -->
		<div v-else-if="latestDigestResult != null" :class="$style.resultBox">
			<div v-if="latestDigestResult.noteCount === 0" :class="$style.emptyTopics">
				{{ i18n.ts._tlDigest.noNotesToSummarize }}
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
				<div :class="$style.footerMeta">
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
					<button type="button" class="_button" :class="$style.subAction" @click="clearTlDigestResult()">
						{{ i18n.ts.close }}
					</button>
				</div>
			</div>
		</div>

		<!-- 4. pending -->
		<div v-else-if="showPendingState && activePending != null" :class="$style.statusRow">
			<div :class="$style.pendingText">
				<span v-if="!widgetProps.showHeader" :class="$style.inlineDot" aria-hidden="true"></span>
				<span>{{ pendingSummaryText }}</span>
			</div>
			<div :class="$style.actionRow">
				<button type="button" class="_button _buttonPrimary" :class="$style.primaryBtn" @click="onSummarizePending()">
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
					<i class="ti ti-x"></i>
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
import { computed, watch } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import MkContainer from '@/components/MkContainer.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import {
	dismissTlDigestPending,
	getActivePendingWindow,
	pendingSinceRef,
	pendingUntilRef,
} from '@/utility/tempura-script/tl-digest/activity.js';
import {
	cancelTlDigest,
	clearTlDigestResult,
	digestError,
	digestGenerating,
	latestDigestResult,
	peekPendingDigestCount,
	pendingCountingRef,
	pendingNoteCountRef,
	retryLastTlDigest,
	runRecentTlDigest,
	runTlDigest,
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

const thresholdMinutes = computed(() => Number(widgetProps.absenceThreshold) || 60);
const maxNotesCount = computed(() => Number(widgetProps.maxNotes) || 100);

const activePending = computed(() => {
	void pendingSinceRef.value;
	void pendingUntilRef.value;
	return getActivePendingWindow(thresholdMinutes.value);
});

const showPendingState = computed(() => {
	if (activePending.value == null) return false;
	if (pendingCountingRef.value) return false;
	return pendingNoteCountRef.value != null && pendingNoteCountRef.value > 0;
});

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
	const count = pendingNoteCountRef.value ?? 0;
	return i18n.tsx._tlDigest.pendingSummary({ duration, count });
});

watch(
	[activePending, () => widgetProps.includeRenotes],
	async ([win, includeRenotes]) => {
		if (win == null || !$i) return;
		const count = await peekPendingDigestCount(win.since, win.until, includeRenotes);
		if (
			count > 0 &&
			widgetProps.autoGenerate &&
			!digestGenerating.value &&
			latestDigestResult.value == null
		) {
			void runTlDigest({
				since: win.since,
				until: win.until,
				maxNotes: maxNotesCount.value,
				includeRenotes,
			});
		}
	},
	{ immediate: true },
);

function onSummarizePending(): void {
	const win = activePending.value;
	if (win == null) return;
	void runTlDigest({
		since: win.since,
		until: win.until,
		maxNotes: maxNotesCount.value,
		includeRenotes: widgetProps.includeRenotes,
	});
}

function onDismissPending(): void {
	dismissTlDigestPending($i?.id ?? null);
}

function onSummarizeRecent(): void {
	void runRecentTlDigest(maxNotesCount.value, widgetProps.includeRenotes);
}

function onRetry(): void {
	void retryLastTlDigest(maxNotesCount.value, widgetProps.includeRenotes);
}

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" module>
.root {
	padding: 10px 12px;
	font-size: 0.9em;
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
	align-items: center;
	justify-content: space-between;
	gap: 8px;
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
