<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer v-if="!iAmAdmin" :showHeader="false" :naked="true">
	<div style="padding: 16px; text-align: center; opacity: 0.7;">
		<i class="ti ti-lock"></i>
		{{ i18n.ts.requireAdminForView }}
	</div>
</MkContainer>
<MkContainer v-else :showHeader="widgetProps.showHeader" :naked="widgetProps.transparent">
	<template #icon><i class="ti ti-alert-triangle"></i></template>
	<template #header>{{ i18n.ts._widgets.federationJobQueue }}</template>
	<template #func="{ buttonStyleClass }">
		<button class="_button" :class="buttonStyleClass" @click="configure">
			<i class="ti ti-settings"></i>
		</button>
	</template>

	<div data-cy-mkw-federationJobQueue class="mkw-federationJobQueue _monospace">
		<!-- タブモード -->
		<template v-if="widgetProps.displayMode === 'tabs'">
			<MkTabs v-model:tab="tab" :tabs="headerTabs"/>

			<div v-if="tab === 'deliver'" class="queue-section">
				<div class="queue-header">
					<i class="ti ti-alert-triangle"></i>
					<span>Deliver - Errored instances</span>
					<span class="job-count">({{ number(deliverJobs.reduce((a, b) => a + b[1], 0)) }} jobs)</span>
				</div>
				<div class="queue-content">
					<div v-if="deliverJobs.length > 0">
						<div v-for="job in deliverJobs" :key="job[0]" class="job-item">
							<MkA :to="`/instance-info/${job[0]}`" behavior="window">{{ job[0] }}</MkA>
							<span class="job-count">({{ number(job[1]) }} jobs)</span>
						</div>
					</div>
					<span v-else class="no-jobs">{{ i18n.ts.noJobs }}</span>
				</div>
			</div>

			<div v-if="tab === 'inbox'" class="queue-section">
				<div class="queue-header">
					<i class="ti ti-alert-triangle"></i>
					<span>Inbox - Errored instances</span>
					<span class="job-count">({{ number(inboxJobs.reduce((a, b) => a + b[1], 0)) }} jobs)</span>
				</div>
				<div class="queue-content">
					<div v-if="inboxJobs.length > 0">
						<div v-for="job in inboxJobs" :key="job[0]" class="job-item">
							<MkA :to="`/instance-info/${job[0]}`" behavior="window">{{ job[0] }}</MkA>
							<span class="job-count">({{ number(job[1]) }} jobs)</span>
						</div>
					</div>
					<span v-else class="no-jobs">{{ i18n.ts.noJobs }}</span>
				</div>
			</div>
		</template>

		<!-- 縦並びモード -->
		<template v-else>
			<div class="queue-section">
				<div class="queue-header">
					<i class="ti ti-alert-triangle"></i>
					<span>Deliver - Errored instances</span>
					<span class="job-count">({{ number(deliverJobs.reduce((a, b) => a + b[1], 0)) }} jobs)</span>
				</div>
				<div class="queue-content">
					<div v-if="deliverJobs.length > 0">
						<div v-for="job in deliverJobs" :key="job[0]" class="job-item">
							<MkA :to="`/instance-info/${job[0]}`" behavior="window">{{ job[0] }}</MkA>
							<span class="job-count">({{ number(job[1]) }} jobs)</span>
						</div>
					</div>
					<span v-else class="no-jobs">{{ i18n.ts.noJobs }}</span>
				</div>
			</div>

			<div class="queue-section">
				<div class="queue-header">
					<i class="ti ti-alert-triangle"></i>
					<span>Inbox - Errored instances</span>
					<span class="job-count">({{ number(inboxJobs.reduce((a, b) => a + b[1], 0)) }} jobs)</span>
				</div>
				<div class="queue-content">
					<div v-if="inboxJobs.length > 0">
						<div v-for="job in inboxJobs" :key="job[0]" class="job-item">
							<MkA :to="`/instance-info/${job[0]}`" behavior="window">{{ job[0] }}</MkA>
							<span class="job-count">({{ number(job[1]) }} jobs)</span>
						</div>
					</div>
					<span v-else class="no-jobs">{{ i18n.ts.noJobs }}</span>
				</div>
			</div>
		</template>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { onUnmounted, ref, computed, watch } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import number from '@/filters/number.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import MkContainer from '@/components/MkContainer.vue';
import MkTabs from '@/components/MkTabs.vue';
import { iAmAdmin } from '@/i.js';

export type ApQueueDomain = 'deliver' | 'inbox';

const name = 'federationJobQueue';

const widgetPropsDef = {
	showHeader: {
		type: 'boolean',
		default: true,
	},
	transparent: {
		type: 'boolean',
		default: false,
	},
	displayMode: {
		type: 'enum',
		default: 'tabs',
		enum: [
			{ label: 'Tabs', value: 'tabs' },
			{ label: 'Vertical', value: 'vertical' },
		],
	},
	refreshIntervalSec: {
		type: 'number',
		default: 60,
		description: '更新間隔（秒）',
	},
} satisfies FormWithDefault;

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure } = useWidgetPropsManager(name,
	widgetPropsDef,
	props,
	emit,
);

const tab = ref<ApQueueDomain>('deliver');
const deliverJobs = ref<any[]>([]);
const inboxJobs = ref<any[]>([]);
let intervalId: number | null = null;

const headerTabs = computed(() => [{
	key: 'deliver',
	title: 'Deliver',
}, {
	key: 'inbox',
	title: 'Inbox',
}]);

// エラーになったインスタンスのジョブを取得
const fetchErroredJobs = async () => {
	try {
		const deliverJobsData = await misskeyApi('admin/queue/deliver-delayed');
		const inboxJobsData = await misskeyApi('admin/queue/inbox-delayed');

		deliverJobs.value = deliverJobsData.sort((a, b) => b[1] - a[1]);
		inboxJobs.value = inboxJobsData.sort((a, b) => b[1] - a[1]);
	} catch (error) {
		console.error('Failed to fetch errored jobs:', error);
	}
};

// intervalを設定
const setupInterval = () => {
	if (intervalId) {
		window.clearInterval(intervalId);
	}

	if (iAmAdmin && widgetProps.refreshIntervalSec > 0) {
		intervalId = window.setInterval(fetchErroredJobs, widgetProps.refreshIntervalSec * 1000);
	}
};

// 初期化
if (iAmAdmin) {
	fetchErroredJobs();
	setupInterval();
}

// 設定変更時にintervalを再設定
watch(() => widgetProps.refreshIntervalSec, () => {
	setupInterval();
});

onUnmounted(() => {
	if (intervalId) {
		window.clearInterval(intervalId);
	}
});

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" scoped>
.mkw-federationJobQueue {
	font-size: 0.9em;

	.queue-section {
		margin-bottom: 16px;

		&:last-child {
			margin-bottom: 0;
		}
	}

	.queue-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		font-weight: bold;
		border-bottom: solid 0.5px var(--MI_THEME-divider);
		background: var(--MI_THEME-panelHeaderBg);

		i {
			color: var(--MI_THEME-warn);
		}

		.job-count {
			margin-left: auto;
			font-weight: normal;
			opacity: 0.7;
		}
	}

	.queue-content {
		padding: 12px 16px;

		.job-item {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 8px 0;
			border-bottom: solid 0.5px var(--MI_THEME-divider);

			&:last-child {
				border-bottom: none;
			}

			.job-count {
				margin-left: auto;
				opacity: 0.7;
				font-size: 0.9em;
			}
		}

		.no-jobs {
			opacity: 0.5;
			font-style: italic;
			text-align: center;
			padding: 16px 0;
		}
	}
}
</style>
