<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkButton v-if="$i && ($i.isModerator || $i.policies.canManageCustomEmojis)" primary link to="/custom-emojis-manager">{{ i18n.ts.manageCustomEmojis }}</MkButton>

	<div class="query">
		<MkInput v-model="q" class="" :placeholder="i18n.ts.search" autocapitalize="off">
			<template #prefix><i class="ti ti-search"></i></template>
		</MkInput>

		<!-- たくさんあると邪魔
		<div class="tags">
			<span class="tag _button" v-for="tag in customEmojiTags" :class="{ active: selectedTags.has(tag) }" @click="toggleTag(tag)">{{ tag }}</span>
		</div>
		-->
	</div>

	<MkFoldableSection v-if="searchEmojis">
		<template #header>{{ i18n.ts.searchResult }}</template>
		<div :class="$style.emojis">
			<XEmoji v-for="emoji in searchEmojis" :key="emoji.name" :emoji="emoji"/>
		</div>
	</MkFoldableSection>

	<MkFoldableSection v-for="category in customEmojiCategories" v-once :key="category">
		<template #header>{{ category || i18n.ts.other }}</template>
		<div :class="$style.emojis">
			<XEmoji v-for="emoji in customEmojis.filter(e => e.category === category)" :key="emoji.name" :emoji="emoji"/>
		</div>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { watch, ref } from 'vue';
import * as Misskey from 'misskey-js';
import XEmoji from './emojis.emoji.vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import { customEmojis, customEmojiCategories, getCustomEmojiTags } from '@/custom-emojis.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';

const customEmojiTags = getCustomEmojiTags();
const q = ref('');
const searchEmojis = ref<Misskey.entities.EmojiSimple[]>(null);
const selectedTags = ref(new Set());

interface NegativeToken {
	value: string;
	mode: 'both' | 'name';
}

function parseQuery(query: string): { positive: string[]; negative: NegativeToken[] } {
	const positive: string[] = [];
	const negative: NegativeToken[] = [];
	// トークンは空白で分割
	query.trim().split(/\s+/).forEach(token => {
		if (token.startsWith('-') && token.length > 1) {
			// 「-blob」の形：両方チェック
			negative.push({ value: token.substring(1), mode: 'both' });
		} else if (token.includes('-') && !token.startsWith('-')) {
			// 「cat-blob」の形：先頭部分を正語、'-'以降を負の語(名前のみチェック)
			const idx = token.indexOf('-');
			const pos = token.substring(0, idx);
			const neg = token.substring(idx + 1);
			if (pos) {
				positive.push(pos);
			}
			if (neg) {
				negative.push({ value: neg, mode: 'name' });
			}
		} else {
			positive.push(token);
		}
	});
	return { positive, negative };
}

function search() {
	if ((q.value === '' || q.value == null) && selectedTags.value.size === 0) {
		searchEmojis.value = null;
		return;
	}

	// 選択タグが無い場合、検索文字列をパースして正負両方のトークンで検索
	if (selectedTags.value.size === 0) {
		// 既存のコロン指定検索との併用例（例：":emoji:"）はそのままで優先する場合：
		const queryArray = q.value.match(/\:([a-z0-9_]*)\:/g);
		if (queryArray) {
			searchEmojis.value = customEmojis.value.filter(emoji =>
				queryArray.includes(`:${emoji.name}:`),
			);
		} else {
			const { positive, negative } = parseQuery(q.value);
			searchEmojis.value = customEmojis.value.filter(emoji => {
				// 正のトークンは、名前またはエイリアスに部分一致すればOK
				const posOk = positive.every(term =>
					emoji.name.includes(term) || emoji.aliases.some(a => a.includes(term)),
				);
				if (!posOk) return false;
				// 負のトークンは、モードに応じてチェック
				const negOk = negative.every(({ value, mode }) => {
					if (mode === 'both') {
						return !(emoji.name.includes(value) || emoji.aliases.some(a => a.includes(value)));
					} else {
						// mode === 'name'
						return !emoji.name.includes(value);
					}
				});
				return negOk;
			});
		}
	} else {
		// タグ選択時は、絵文字タグフィルターとの併用
		searchEmojis.value = customEmojis.value.filter(emoji => {
			const basicMatch = emoji.name.includes(q.value) || emoji.aliases.includes(q.value);
			const tagMatch = [...selectedTags.value].every(t => emoji.aliases.includes(t));
			return basicMatch && tagMatch;
		});
	}
}

function toggleTag(tag) {
	if (selectedTags.value.has(tag)) {
		selectedTags.value.delete(tag);
	} else {
		selectedTags.value.add(tag);
	}
}

watch(q, () => {
	search();
});

watch(selectedTags, () => {
	search();
}, { deep: true });
</script>

<style lang="scss" module>
.emojis {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
	grid-gap: 12px;
}
</style>
