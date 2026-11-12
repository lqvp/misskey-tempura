<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->
<template>
<div :class="$style.scroll" class="_selectable">
	<table :class="$style.table">
		<thead><tr><th>{{ i18n.ts.name }}</th><th>{{ i18n.ts._llmUsage.total }}</th><th>{{ i18n.ts._llmUsage.samples }}</th></tr></thead>
		<tbody>
			<tr v-for="metric in metrics" :key="metric"><th>{{ i18n.ts._llmUsage[metric] }}</th><td>{{ formatUsageNumber(data.tokens[metric].value) }}</td><td>{{ formatUsageNumber(data.tokens[metric].samples) }} / {{ formatUsageNumber(data.successes) }} <span v-if="BigInt(data.tokens[metric].samples) < BigInt(data.successes)">{{ i18n.ts._llmUsage.partial }}</span></td></tr>
			<tr v-for="counter in counters" :key="counter"><th>{{ i18n.ts._llmUsage[counter] }}</th><td colspan="2">{{ formatUsageNumber(data[counter]) }}</td></tr>
		</tbody>
	</table>
</div>
</template>
<script lang="ts" setup>
import type { Endpoints } from 'misskey-js';
import { i18n } from '@/i18n.js';
import { formatUsageNumber } from '@/utility/tempura-script/llm-usage.js';
defineProps<{ data: Endpoints['admin/llm-usage/overview']['res']['summary'] }>();
const metrics = ['input', 'output', 'thinking', 'cached', 'total'] as const;
const counters = ['requests', 'successes', 'failures'] as const;
</script>
<style lang="scss" module>
.scroll { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; th, td { padding: 8px; text-align: start; border-bottom: 1px solid var(--MI_THEME-divider); } }
</style>
