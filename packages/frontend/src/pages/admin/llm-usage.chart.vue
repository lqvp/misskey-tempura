<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->
<template><div :class="$style.root"><canvas ref="canvas" :aria-label="i18n.ts._llmUsage.chart" role="img"></canvas></div></template>
<script lang="ts" setup>
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue';
import { Chart } from 'chart.js';
import type { Endpoints } from 'misskey-js';
import { initChart } from '@/utility/init-chart.js';
import { useChartTooltip } from '@/composables/use-chart-tooltip.js';
import { chartTokenValue } from '@/utility/tempura-script/llm-usage.js';
import { themeManager } from '@/theme.js';
import { i18n } from '@/i18n.js';
initChart();
const props = defineProps<{ data: Endpoints['admin/llm-usage/overview']['res']; purpose?: boolean }>();
const canvas = useTemplateRef('canvas');
const { handler } = useChartTooltip();
let chart: Chart | null = null;

function render() {
	chart?.destroy();
	if (!canvas.value) return;
	const colors = getComputedStyle(canvas.value);
	const days = Array.from({ length: new Date(Date.UTC(props.data.year, props.data.month, 0)).getUTCDate() }, (_, i) => `${props.data.year}-${String(props.data.month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
	chart = new Chart(canvas.value, {
		type: props.purpose ? 'bar' : 'line',
		data: { labels: props.purpose ? props.data.byPurpose.map(x => x.purpose) : days.map(d => d.slice(5).replace('-', '/')), datasets: [
			{ label: i18n.ts._llmUsage.requests, yAxisID: 'requests', data: props.purpose ? props.data.byPurpose.map(x => chartTokenValue(x.requests)) : days.map(d => chartTokenValue(props.data.daily.find(x => x.date === d)?.requests ?? null)), borderColor: colors.getPropertyValue('--MI_THEME-accent').trim(), backgroundColor: colors.getPropertyValue('--MI_THEME-accent').trim(), borderWidth: 2, pointRadius: 2, borderRadius: 4, spanGaps: false },
			{ label: i18n.ts._llmUsage.total, yAxisID: 'tokens', data: props.purpose ? props.data.byPurpose.map(x => chartTokenValue(x.tokens.total.value)) : days.map(d => chartTokenValue(props.data.daily.find(x => x.date === d)?.tokens.total.value ?? null)), borderColor: colors.getPropertyValue('--MI_THEME-warn').trim(), backgroundColor: colors.getPropertyValue('--MI_THEME-warn').trim(), borderWidth: 2, pointRadius: 2, borderRadius: 4, spanGaps: false },
		] },
		options: { maintainAspectRatio: false, animation: false, scales: { requests: { beginAtZero: true, position: 'left', title: { display: true, text: i18n.ts._llmUsage.requests } }, tokens: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: i18n.ts._llmUsage.total } } }, plugins: { tooltip: { enabled: false, external: handler } } },
	});
}

watch(() => props.data, render);
onMounted(() => { render(); themeManager.on('themeChanged', render); });
onUnmounted(() => { chart?.destroy(); themeManager.off('themeChanged', render); });
</script>
<style lang="scss" module>
.root { height: 300px; min-width: 0; }
</style>
