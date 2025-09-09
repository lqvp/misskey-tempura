<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs"/></template>
	<div class="main-content-container">
		<MkInfo>
			{{ i18n.ts._reactionStats.reactionStatsDescription }}
		</MkInfo>

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
					<MkReactionIcon :reaction="summary.mostUsed.reaction" :emojiUrl="getEmojiUrl(summary.mostUsed.reaction)" :noStyle="true"/>
					<span>{{ summary.mostUsed.count }}</span>
				</div>
			</div>
		</div>

		<div v-if="chartData" class="chart-container _spacer">
			<canvas ref="chartEl"></canvas>
			<div class="chart-labels">
				<div v-for="item in chartData" :key="item.reaction" class="label-item">
					<MkReactionIcon :reaction="item.reaction" :emojiUrl="getEmojiUrl(item.reaction)" :noStyle="true"/>
				</div>
			</div>
		</div>
		<div v-else class="loading">
			<MkLoading/>
		</div>
	</div>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { computed, ref, watch, nextTick } from 'vue';
import { Chart } from 'chart.js';
import { onMounted, useTemplateRef } from 'vue';
import { misskeyApi } from '@/utility/misskey-api';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { ensureSignin } from '@/i.js';
import MkInfo from '@/components/MkInfo.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import { initChart } from '@/utility/init-chart.js';
import { customEmojisMap } from '@/custom-emojis.js';

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

watch(tab, async () => {
	chartData.value = null; // データをリセットしてローディング状態を示す
	try {
		const reactionsList = await misskeyApi('reaction-stats', { site: tab.value === 'site' });
		chartData.value = reactionsList;
	} catch (error) {
		console.error('Failed to fetch reaction stats:', error);
		chartData.value = [];
	}
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

initChart();

const chartEl = useTemplateRef('chartEl');
let chartInstance: Chart | null = null;

// Misskey-style color palette
const colorPalette = [
	'#008FFB', // blue
	'#00E396', // green
	'#FEB019', // yellow
	'#FF4560', // red
	'#e300db', // purple
	'#fe6919', // orange
	'#bde800', // lime
	'#00e0e0', // cyan
];

function getColor(i: number) {
	return colorPalette[i % colorPalette.length];
}

function getEmojiUrl(reaction: string): string | undefined {
	if (reaction[0] !== ':') return undefined;
	const name = reaction.substring(1, reaction.length - 1).replace('@.', '');
	const emoji = customEmojisMap.get(name);
	return emoji?.url;
}

function renderChart() {
	if (!chartData.value || chartData.value.length === 0 || !chartEl.value) return;
	if (chartInstance) chartInstance.destroy();
	chartInstance = new Chart(chartEl.value, {
		type: 'bar',
		data: {
			labels: chartData.value.map((_, i) => ''), // 空のラベルを使用
			datasets: [{
				label: i18n.ts._reactionStats.totalReactions,
				data: chartData.value.map(x => x.count),
				backgroundColor: chartData.value.map((_, i) => getColor(i)),
				borderRadius: 4,
				barPercentage: 0.9,
				categoryPercentage: 0.9,
			}],
		},
		options: {
			aspectRatio: 2.5,
			plugins: {
				legend: { display: false },
				tooltip: {
					enabled: true,
					callbacks: {
						label: (context) => {
							const item = chartData.value?.[context.dataIndex];
							if (!item) return '';
							// Remove leading and trailing colons from reaction for display
							const reactionName = item.reaction.startsWith(':') && item.reaction.endsWith(':')
								? item.reaction.slice(1, -1)
								: item.reaction;
							return `${reactionName}: ${item.count}`;
						},
					},
				},
			},
			scales: {
				x: {
					grid: { display: false },
					ticks: {
						display: false, // ラベルを非表示
					},
				},
				y: {
					beginAtZero: true,
					grid: { display: true },
					ticks: { font: { size: 14 } },
				},
			},
			layout: {
				padding: { left: 0, right: 8, top: 0, bottom: 0 },
			},
		},
	});
}

onMounted(() => {
	if (chartData.value) renderChart();
});

watch(chartData, async () => {
	await nextTick();
	renderChart();
});
</script>

<style lang="scss" scoped>
.main-content-container {
	padding: 0 20px;
}

.summary-container {
	display: flex;
	justify-content: space-around;
	text-align: center;
	padding: 20px;
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
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 8px;
			font-size: 1.2em;
			line-height: 1.5;

			:deep(.custom-emoji) {
				height: 1.2em;
				max-height: 1.2em;
				width: auto;
				max-width: 2em;
				object-fit: contain;
				vertical-align: middle;
			}

			:deep(img) {
				height: 1.2em;
				max-height: 1.2em;
				width: auto;
				max-width: 2em;
				object-fit: contain;
				vertical-align: middle;
			}

			:deep(.mfm) {
				font-size: 1.2em;
				vertical-align: middle;
			}
		}
	}
}

.chart-container {
	position: relative;
	overflow-x: auto;
	padding-bottom: 10px;

	canvas {
		min-width: 600px;
		margin-bottom: 10px;
	}

	.chart-labels {
		display: flex;
		justify-content: space-evenly;
		align-items: center;
		padding: 12px 8px;
		margin-top: 4px;
		min-width: 600px;

		.label-item {
			flex: 0 1 auto;
			display: flex;
			justify-content: center;
			align-items: center;
			font-size: 20px;
			height: 40px;
			min-width: 40px;
			padding: 0 4px;
			overflow: visible;

			:deep(.custom-emoji) {
				height: 32px;
				max-height: 32px;
				width: auto;
				max-width: 56px;
				object-fit: contain;
				vertical-align: middle;
			}

			:deep(.mfm) {
				font-size: 20px;
			}

			:deep(img) {
				height: 32px;
				max-height: 32px;
				width: auto;
				max-width: 56px;
				object-fit: contain;
				vertical-align: middle;
			}
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
