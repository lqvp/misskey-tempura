<!--
SPDX-FileCopyrightText: lqvchan-mai and lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon>
		<i v-if="queue.resolved" class="ti ti-check" style="color: var(--MI_THEME-success);"></i>
		<i v-else class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);"></i>
	</template>
	<template #label>
		<MkAcct v-if="queue.noteUser" :user="queue.noteUser"/>
		<span v-else>#{{ queue.noteUserId.toUpperCase() }}</span>
	</template>
	<template #caption>{{ flaggedLabel }}</template>
	<template #suffix><MkTime :time="queue.createdAt"/></template>
	<template #footer>
		<div class="_buttons">
			<MkButton @click="warnUser"><i class="ti ti-message-exclamation"></i> {{ i18n.ts._llmModerationQueue.warnUser }}</MkButton>
			<MkButton :disabled="!queue.note" @click="deleteNote"><i class="ti ti-trash"></i> {{ i18n.ts._llmModerationQueue.deleteNote }}</MkButton>
			<MkButton @click="suspendUser"><i class="ti ti-user-off"></i> {{ i18n.ts._llmModerationQueue.suspendUser }}</MkButton>
			<MkButton v-if="!queue.resolved" primary @click="resolve"><i class="ti ti-check"></i> {{ i18n.ts._llmModerationQueue.resolve }}</MkButton>
		</div>
	</template>

	<div class="_gaps_s">
		<div v-if="queue.note">
			<MkNote :note="queue.note" :mock="true"/>
		</div>
		<div v-else :class="$style.missing">
			<i class="ti ti-alert-triangle"></i>
			{{ i18n.ts._llmModerationQueue.noteMissing }}
		</div>

		<div class="_gaps_s">
			<MkKeyValue>
				<template #key>{{ i18n.ts.visibility }}</template>
				<template #value>{{ visibilityLabel }}</template>
			</MkKeyValue>
			<MkKeyValue>
				<template #key>{{ i18n.ts._llmModerationQueue.origin }}</template>
				<template #value>{{ queue.isRemote ? i18n.ts.remote : i18n.ts.local }}</template>
			</MkKeyValue>
			<MkKeyValue>
				<template #key>{{ i18n.ts._llmModerationQueue.flaggedCategories }}</template>
				<template #value>{{ flaggedLabel }}</template>
			</MkKeyValue>
		</div>

		<MkFolder :defaultOpen="false">
			<template #icon><i class="ti ti-chart-bar"></i></template>
			<template #label>{{ i18n.ts._llmModerationQueue.categoryScores }}</template>
			<div class="_gaps_s">
			<div v-if="scoreEntries.length === 0">{{ i18n.ts.none }}</div>
			<div v-else :class="$style.scores">
				<div
					v-for="entry in scoreEntries"
					:key="entry.key"
					:class="[$style.scoreRow, entry.flagged ? $style.scoreRowFlagged : null]"
				>
					<span :class="$style.scoreLabel">{{ entry.key }}</span>
					<div :class="$style.scoreBar">
						<div :class="$style.scoreBarFill" :style="{ width: `${entry.percent}%` }"></div>
					</div>
					<span :class="$style.scoreValue">{{ formatScore(entry.score) }}</span>
				</div>
			</div>
		</div>
	</MkFolder>

		<MkFolder :defaultOpen="false">
			<template #icon><i class="ti ti-notes"></i></template>
			<template #label>{{ i18n.ts.moderationNote }}</template>
			<template #suffix>{{ moderationNote.length > 0 ? '...' : i18n.ts.none }}</template>
			<div class="_gaps_s">
				<MkTextarea v-model="moderationNote" manualSave>
					<template #caption>{{ i18n.ts.moderationNoteDescription }}</template>
				</MkTextarea>
			</div>
		</MkFolder>

		<div v-if="queue.assignee">
			{{ i18n.ts.moderator }}:
			<MkAcct :user="queue.assignee"/>
		</div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import { debounce } from 'throttle-debounce';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import MkNote from '@/components/MkNote.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	queue: Misskey.entities.LlmModerationQueue;
}>();

const emit = defineEmits<{
	(ev: 'resolved', queueId: string): void;
}>();

const moderationNote = ref(props.queue.moderationNote ?? '');
let skipModerationNoteUpdate = false;
const saveModerationNoteImmediate = () => {
	return os.apiWithDialog('admin/llm-moderation/queue/update', {
		queueId: props.queue.id,
		moderationNote: moderationNote.value,
	});
};
const saveModerationNote = debounce(800, saveModerationNoteImmediate);

const flaggedLabel = computed(() => props.queue.flaggedCategories.length > 0
	? props.queue.flaggedCategories.join(', ')
	: i18n.ts.none);

const visibilityLabel = computed(() => {
	const labels = i18n.ts._visibility as Record<string, string>;
	return labels[props.queue.noteVisibility] ?? props.queue.noteVisibility;
});

const flaggedSet = computed(() => new Set(props.queue.flaggedCategories));

const scoreEntries = computed(() => Object.entries(props.queue.categoryScores ?? {})
	.map(([key, score]) => ({
		key,
		score,
		percent: Math.min(100, Math.max(0, score * 100)),
		flagged: flaggedSet.value.has(key),
	}))
	.sort((a, b) => b.score - a.score));

watch(moderationNote, async () => {
	if (skipModerationNoteUpdate) {
		skipModerationNoteUpdate = false;
		return;
	}
	saveModerationNote();
});

watch(() => props.queue.moderationNote, (next) => {
	const nextValue = next ?? '';
	if (nextValue === moderationNote.value) return;
	skipModerationNoteUpdate = true;
	moderationNote.value = nextValue;
});

async function warnUser() {
	const { canceled, result } = await os.inputText({
		title: i18n.ts._llmModerationQueue.warnUser,
		text: i18n.ts._llmModerationQueue.warnUserPrompt,
	});
	if (canceled || result == null || result.trim().length === 0) return;

	await os.apiWithDialog('admin/send-notification', {
		userId: props.queue.noteUserId,
		text: result,
	});
}

async function deleteNote() {
	if (!props.queue.noteId) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.areYouSure,
		text: i18n.ts._llmModerationQueue.deleteNoteConfirm,
	});
	if (canceled) return;

	await os.apiWithDialog('notes/delete', {
		noteId: props.queue.noteId,
	});
}

async function suspendUser() {
	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.areYouSure,
		text: i18n.ts._llmModerationQueue.suspendUserConfirm,
	});
	if (canceled) return;

	await os.apiWithDialog('admin/suspend-user', {
		userId: props.queue.noteUserId,
	});
}

async function resolve() {
	saveModerationNote.cancel({ upcomingOnly: true });
	await saveModerationNoteImmediate();
	await os.apiWithDialog('admin/llm-moderation/queue/resolve', {
		queueId: props.queue.id,
		moderationNote: moderationNote.value,
	});

	emit('resolved', props.queue.id);
}

function formatScore(score: number): string {
	return score.toFixed(3);
}

onUnmounted(() => {
	saveModerationNote.cancel({ upcomingOnly: true });
});
</script>

<style lang="scss" module>
.missing {
	display: flex;
	align-items: center;
	gap: 8px;
	color: var(--MI_THEME-warn);
}

.scores {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.scoreRow {
	display: flex;
	align-items: center;
	gap: 12px;
}

.scoreRowFlagged {
	font-weight: 600;
}

.scoreLabel {
	min-width: 180px;
	font-size: 0.9em;
}

.scoreBar {
	flex: 1;
	height: 8px;
	border-radius: 999px;
	background: color(from var(--MI_THEME-fg) srgb r g b / 0.12);
	overflow: hidden;
}

.scoreBarFill {
	height: 100%;
	border-radius: inherit;
	background: linear-gradient(90deg, var(--MI_THEME-accent), var(--MI_THEME-warn));
}

.scoreValue {
	min-width: 56px;
	text-align: right;
	font-variant-numeric: tabular-nums;
}
</style>
