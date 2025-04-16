<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_s">
	<MkInput
		v-model="searchQuery"
		:placeholder="i18n.ts.search"
		:autofocus="true"
		@update:modelValue="onSearchInput"
	>
		<template #prefix><i class="ti ti-search"></i></template>
	</MkInput>

	<div v-if="isSearching" class="_gaps_s">
		<MkLoading/>
	</div>
	<div v-else-if="searchResults.length > 0" class="_gaps_s">
		<div :class="$style.decorations">
			<XDecoration
				v-for="decoration in searchResults"
				:key="decoration.id"
				:decoration="decoration"
				@click="selectDecoration(decoration)"
			/>
		</div>
	</div>
	<div v-else-if="searchQuery" class="_gaps_s">
		<MkInfo>{{ i18n.ts.noResults }}</MkInfo>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkInput from '@/components/MkInput.vue';
import MkInfo from '@/components/MkInfo.vue';
import XDecoration from '@/pages/settings/avatar-decoration.decoration.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { $i } from '@/account.js';

const props = defineProps<{
	modelValue: string | null;
}>();

const emit = defineEmits<{
	(ev: 'update:modelValue', value: string | null): void;
	(ev: 'select', value: {
		id: string;
		name: string;
		description: string | null;
		url: string;
		roleIdsThatCanBeUsedThisDecoration: string[];
	}): void;
}>();

const searchQuery = ref('');
const searchResults = ref<{
	id: string;
	name: string;
	description: string | null;
	url: string;
	roleIdsThatCanBeUsedThisDecoration: string[];
}[]>([]);
const isSearching = ref(false);
const searchTimeout = ref<number | null>(null);

async function onSearchInput() {
	if (searchTimeout.value) {
		window.clearTimeout(searchTimeout.value);
	}

	if (!searchQuery.value) {
		searchResults.value = [];
		return;
	}

	isSearching.value = true;

	searchTimeout.value = window.setTimeout(async () => {
		try {
			const results = await misskeyApi('search-avatar-decorations', {
				query: searchQuery.value,
				origin: $i.policies.canUseRemoteIconDecorations ? 'combined' : 'local',
			});
			searchResults.value = results as {
				id: string;
				name: string;
				description: string | null;
				url: string;
				roleIdsThatCanBeUsedThisDecoration: string[];
			}[];
		} catch (err) {
			console.error(err);
		} finally {
			isSearching.value = false;
		}
	}, 300);
}

function selectDecoration(decoration: {
	id: string;
	name: string;
	description: string | null;
	url: string;
	roleIdsThatCanBeUsedThisDecoration: string[];
}) {
	emit('update:modelValue', decoration.id);
	emit('select', decoration);
}
</script>

<style lang="scss" module>
.decorations {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
	grid-gap: 12px;
}
</style>
