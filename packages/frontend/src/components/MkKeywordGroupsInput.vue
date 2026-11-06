<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<template v-for="(group, gi) in model" :key="gi">
		<div v-if="gi > 0" :class="$style.or"><span :class="$style.orLine"></span>{{ i18n.ts._tempuraFutureAntenna.keywordOr }}<span :class="$style.orLine"></span></div>
		<div :class="$style.group">
			<div :class="$style.keywords">
				<template v-for="(keyword, ki) in group" :key="ki">
					<span v-if="ki > 0" :class="$style.and">{{ i18n.ts._tempuraFutureAntenna.keywordAnd }}</span>
					<span :class="[$style.chip, { [$style.regexChip]: props.regexMode }]">
						{{ keyword }}
						<button class="_button" :class="$style.chipRemove" :aria-label="i18n.ts.delete" @click="removeKeyword(gi, ki)"><i class="ti ti-x"></i></button>
					</span>
				</template>
				<input
					v-model="inputs[gi]"
					:class="$style.input"
					type="text"
					:placeholder="props.regexMode ? i18n.ts._tempuraFutureAntenna.addRegexPattern : i18n.ts._tempuraFutureAntenna.addKeyword"
					@keydown.enter.prevent="addKeyword(gi)"
					@blur="addKeyword(gi)"
				>
				<MkButton inline small :disabled="inputs[gi].trim() === ''" @click="addKeyword(gi)"><i class="ti ti-plus"></i></MkButton>
			</div>
			<button v-if="model.length > 1" class="_button" :class="$style.groupRemove" :title="i18n.ts._tempuraFutureAntenna.removeGroup" :aria-label="i18n.ts._tempuraFutureAntenna.removeGroup" @click="removeGroup(gi)"><i class="ti ti-trash"></i></button>
		</div>
	</template>
	<div :class="$style.footer">
		<MkButton inline small @click="addGroup()"><i class="ti ti-plus"></i> {{ i18n.ts._tempuraFutureAntenna.addGroup }}</MkButton>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';

// グループ=OR、グループ内=AND。テキストの書き方を覚えなくても追加・削除で条件を組めるようにする。
// regexModeのときは入力を空白で分割せず、1項目全体を1つの正規表現として扱う。
const props = withDefaults(defineProps<{
	regexMode?: boolean;
}>(), {
	regexMode: false,
});

const model = defineModel<string[][]>({ required: true });

const inputs = ref<string[]>(model.value.map(() => ''));

watch(model, (newValue) => {
	while (inputs.value.length < newValue.length) inputs.value.push('');
	inputs.value.length = newValue.length;
});

function normalize(keyword: string): string {
	// regexモードでは空白も式の一部なので、前後の空白を除く以外は触らない
	return props.regexMode ? keyword.trim() : keyword.trim().replace(/\s+/g, ' ');
}

function addKeyword(gi: number) {
	const keyword = normalize(inputs.value[gi] ?? '');
	if (keyword === '') return;
	const next = model.value.map(g => [...g]);
	if (props.regexMode) {
		next[gi].push(keyword);
	} else {
		// 空白を含む入力は従来のスペース区切りと同じくANDとして分割する
		next[gi].push(...keyword.split(' ').filter(x => x !== ''));
	}
	model.value = next;
	inputs.value[gi] = '';
}

function removeKeyword(gi: number, ki: number) {
	const next = model.value.map(g => [...g]);
	next[gi].splice(ki, 1);
	if (next[gi].length === 0 && next.length > 1) {
		next.splice(gi, 1);
		inputs.value.splice(gi, 1);
	}
	model.value = next;
}

function addGroup() {
	model.value = [...model.value, []];
}

function removeGroup(gi: number) {
	const next = model.value.map(g => [...g]);
	next.splice(gi, 1);
	inputs.value.splice(gi, 1);
	model.value = next.length > 0 ? next : [[]];
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.group {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	padding: 8px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 6px;
}

.keywords {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	flex: 1;
}

.and {
	font-size: 0.8em;
	opacity: 0.7;
}

.chip {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 4px 8px;
	background: var(--MI_THEME-buttonBg);
	border-radius: 6px;
	font-size: 0.9em;
}

.regexChip {
	font-family: monospace;
}

.chipRemove {
	display: inline-flex;
	opacity: 0.7;

	&:hover {
		opacity: 1;
	}
}

.input {
	flex: 1;
	min-width: 120px;
	padding: 6px 8px;
	font: inherit;
	color: inherit;
	background: transparent;
	border: none;
	border-bottom: solid 1px var(--MI_THEME-divider);
	outline: none;

	&:focus {
		border-bottom-color: var(--MI_THEME-accent);
	}
}

.groupRemove {
	padding: 6px;
	opacity: 0.7;

	&:hover {
		opacity: 1;
		color: var(--MI_THEME-error);
	}
}

.or {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 0.8em;
	opacity: 0.7;
}

.orLine {
	flex: 1;
	height: 1px;
	background: var(--MI_THEME-divider);
}

.footer {
	margin-top: 4px;
}
</style>
