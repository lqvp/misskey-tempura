<!--
SPDX-FileCopyrightText: chan-mai and lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 900px;">
		<div :class="$style.root" class="_gaps">
			<MkTip k="llmModerationQueue">
				{{ i18n.ts._llmModerationQueue.description }}
			</MkTip>

			<div :class="$style.inputs" class="_gaps">
				<MkSelect v-model="state" :items="stateDef" style="margin: 0; flex: 1;">
					<template #label>{{ i18n.ts.state }}</template>
				</MkSelect>
				<MkSelect v-model="origin" :items="originDef" style="margin: 0; flex: 1;">
					<template #label>{{ i18n.ts._llmModerationQueue.origin }}</template>
				</MkSelect>
			</div>

			<MkPagination v-slot="{ items }" :paginator="paginator">
				<div class="_gaps">
					<MkLlmModerationQueueItem v-for="queue in items" :key="queue.id" :queue="queue" @resolved="resolved"/>
				</div>
			</MkPagination>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw } from 'vue';
import MkSelect from '@/components/MkSelect.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkLlmModerationQueueItem from '@/components/MkLlmModerationQueueItem.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useMkSelect } from '@/composables/use-mkselect.js';
import { Paginator } from '@/utility/paginator.js';

const {
	model: state,
	def: stateDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.all, value: 'all' },
		{ label: i18n.ts.unresolved, value: 'unresolved' },
		{ label: i18n.ts.resolved, value: 'resolved' },
	],
	initialValue: 'unresolved',
});

const {
	model: origin,
	def: originDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.all, value: 'combined' },
		{ label: i18n.ts.local, value: 'local' },
		{ label: i18n.ts.remote, value: 'remote' },
	],
	initialValue: 'combined',
});

const paginator = markRaw(new Paginator('admin/llm-moderation/queue', {
	limit: 10,
	computedParams: computed(() => ({
		state: state.value,
		origin: origin.value,
	})),
}));

function resolved(queueId: string) {
	paginator.removeItem(queueId);
}

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.llmModerationQueue,
	icon: 'ti ti-shield-exclamation',
}));
</script>

<style module lang="scss">
.root {
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: stretch;
}

.inputs {
	display: flex;
	flex-direction: row;
	justify-content: space-between;
	align-items: center;
}
</style>
