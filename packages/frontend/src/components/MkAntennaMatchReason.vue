<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="matchedKeywords.length > 0 || matchedExcludeKeywords.length > 0" :class="$style.root">
	<div v-if="matchedKeywords.length > 0" :class="$style.line">
		<i class="ti ti-antenna" :class="$style.icon"></i>
		<span :class="$style.label">{{ i18n.ts._tempuraFutureAntenna.matchReason }}:</span>
		<span v-for="(group, i) in matchedKeywords" :key="i" :class="$style.group">
			<template v-if="i > 0"> {{ i18n.ts._tempuraFutureAntenna.keywordOr }} </template>
			<span :class="[$style.chip, { [$style.monospace]: props.regexMode }]">{{ group.join(' ' + i18n.ts._tempuraFutureAntenna.keywordAnd + ' ') }}</span>
		</span>
	</div>
	<div v-if="matchedExcludeKeywords.length > 0" :class="$style.line">
		<i class="ti ti-antenna" :class="$style.icon"></i>
		<span :class="$style.label">{{ i18n.ts._tempuraFutureAntenna.matchReasonExclude }}:</span>
		<span v-for="(group, i) in matchedExcludeKeywords" :key="i" :class="$style.group">
			<template v-if="i > 0"> {{ i18n.ts._tempuraFutureAntenna.keywordOr }} </template>
			<span :class="[$style.chip, { [$style.monospace]: props.regexMode }]">{{ group.join(' ' + i18n.ts._tempuraFutureAntenna.keywordAnd + ' ') }}</span>
		</span>
	</div>
</div>
</template>

<script lang="ts" setup>
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	matchedKeywords: string[][];
	matchedExcludeKeywords: string[][];
	// 正規表現モードでは条件が式そのものなので、読み違えないよう等幅で出す
	regexMode?: boolean;
}>(), {
	regexMode: false,
});
</script>

<style lang="scss" module>
.root {
	padding: 8px 32px 0 32px;
	font-size: 0.8em;
}

.line {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	padding: 4px 0;
	opacity: 0.8;
}

.icon {
	font-size: 0.9em;
}

.label {
	flex-shrink: 0;
}

.group {
	display: inline-flex;
	align-items: center;
}

.monospace {
	font-family: monospace;
	// 正規表現には改行や連続空白が含まれうるので、保存値どおりに表示する
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.chip {
	padding: 2px 8px;
	background: var(--MI_THEME-buttonBg);
	border-radius: 6px;
}

@media (max-width: 500px) {
	.root {
		padding: 8px 16px 0 16px;
	}
}
</style>
