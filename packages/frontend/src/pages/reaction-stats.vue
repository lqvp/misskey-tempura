<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs"/></template>
	<div style="padding: 0 20px;">
		<MkInfo>
			{{ i18n.ts._reactionStats.reactionStatsDescription }}
		</MkInfo>
	</div>

	<div class="summary-container">
		<div class="summary-item">
			<div class="label">{{ i18n.ts._reactionStats.totalReactions }}</div>
			<div class="value">{{ summary.total }}</div>
		</div>
		<div class="summary-item">
			<div class="label">{{ i18n.ts._reactionStats.uniqueReactions }}</div>
			<div class="value">{{ summary.unique }}</div>
		</div>
		<div v-if="summary.mostUsed" class="summary-item">
			<div class="label">{{ i18n.ts._reactionStats.mostUsedReaction }}</div>
			<div class="value most-used">
				<Mfm :text="summary.mostUsed.reaction"/>
				<span>{{ summary.mostUsed.count }}</span>
			</div>
		</div>
	</div>

	<div v-if="chartData" class="chart-container _spacer" style="--MI_SPACER-w: 1000px; --MI_SPACER-marginMin: 20px;">
		<ul>
			<li v-for="item in chartData" :key="item.reaction" class="chart-item">
				<Mfm :text="item.reaction" class="reaction"/>
				<div class="bar-container">
					<div class="bar" :style="{ width: `${(item.count / maxCount) * 100}%` }"></div>
				</div>
				<span class="count">{{ item.count }}</span>
			</li>
		</ul>
	</div>
	<div v-else class="loading">
		<MkLoading/>
	</div>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { misskeyApi } from '@/utility/misskey-api';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { ensureSignin } from '@/i.js';
import MkInfo from '@/components/MkInfo.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import Mfm from '@/components/global/MkMfm';

const $i = ensureSignin();

type ReactionStat = {
	reaction: string;
	count: number;
};

const tab = ref('me');
const chartData = ref<ReactionStat[] | null>(null);

const summary = computed(() => {
	if (!chartData.value || chartData.value.length === 0) {
		return {
			total: 0,
			unique: 0,
			mostUsed: null,
		};
	}

	const total = chartData.value.reduce((acc, cur) => acc + cur.count, 0);
	const unique = chartData.value.length;
	const mostUsed = chartData.value[0]; // data is already sorted by count DESC

	return { total, unique, mostUsed };
});

const maxCount = computed(() => {
	if (!chartData.value || chartData.value.length === 0) {
		return 1;
	}
	return Math.max(...chartData.value.map(x => x.count));
});

watch(tab, async () => {
	chartData.value = null; // データをリセットしてローディング状態を示す
	const reactionsList = await misskeyApi('reaction-stats', { site: tab.value === 'site' });
	chartData.value = reactionsList;
}, {
	immediate: true,
});

const headerActions = computed(() => []);

const headerTabs = computed(() => [{
	key: 'me',
	title: $i.username,
	icon: 'ti ti-user',
}, {
	key: 'site',
	title: i18n.ts.instance,
	icon: 'ti ti-planet',
}]);

definePage(() => ({
	title: i18n.ts._reactionStats.reactionStats,
	icon: 'ti ti-chart-bar',
}));
</script>

<style lang="scss" scoped>
.summary-container {
	display: flex;
	justify-content: space-around;
	text-align: center;
	padding: 20px;
	margin: 0 20px;
	border-bottom: 1px solid var(--divider);

	.summary-item {
		.label {
			font-size: 0.9em;
			color: var(--fg-2);
		}
		.value {
			font-size: 1.5em;
			font-weight: bold;
		}
		.most-used {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 8px;
			font-size: 1.2em;

			:deep(.mfm) {
				font-size: 1.5em;
			}
		}
	}
}

.chart-container {
	ul {
		padding: 0;
		margin: 0;
		list-style: none;
	}

	.chart-item {
		display: flex;
		align-items: center;
		margin-bottom: 8px;
		gap: 8px;

		.reaction {
			width: 32px;
			height: 32px;
			font-size: 24px;
			display: flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
		}

		.bar-container {
			flex-grow: 1;
			height: 24px;
			background: var(--bg);
			border-radius: 4px;
			overflow: hidden;
		}

		.bar {
			height: 100%;
			background: var(--accent);
			border-radius: 4px;
		}

		.count {
			min-width: 40px;
			text-align: right;
			font-family: var(--font-monospace);
			flex-shrink: 0;
		}
	}
}

.loading {
	display: flex;
	justify-content: center;
	align-items: center;
	height: 200px;
}
</style>
