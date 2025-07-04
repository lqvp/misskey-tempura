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

	<template v-if="showLocalDecorations">
		<MkFolder>
			<template #label>{{ i18n.ts.local }}</template>
			<div :class="$style.decorations">
				<XDecoration
					v-for="localAvatarDecoration in visibleLocalDecorations"
					:key="localAvatarDecoration.id"
					:decoration="localAvatarDecoration"
					@click="selectDecoration(localAvatarDecoration)"
				/>
			</div>
			<MkButton v-if="hasMoreLocalDecorations" class="mt-4" @click="loadMoreLocalDecorations">
				{{ i18n.ts.loadMore }}
			</MkButton>
		</MkFolder>
	</template>

	<template v-if="showRemoteDecorations && $i?.policies.canUseRemoteIconDecorations">
		<MkFolder>
			<template #label>{{ i18n.ts.remote }}</template>
			<div :class="$style.decorations">
				<XDecoration
					v-for="remoteAvatarDecoration in visibleRemoteDecorations"
					:key="remoteAvatarDecoration.id"
					:decoration="remoteAvatarDecoration"
					@click="selectDecoration(remoteAvatarDecoration)"
				/>
			</div>
			<MkButton v-if="hasMoreRemoteDecorations" class="mt-4" @click="loadMoreRemoteDecorations">
				{{ i18n.ts.loadMore }}
			</MkButton>
		</MkFolder>
	</template>
</div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkInput from '@/components/MkInput.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import XDecoration from '@/pages/settings/avatar-decoration.decoration.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { $i } from '@/i.js';

const props = defineProps<{
	modelValue: string | null;
	showLocalDecorations?: boolean;
	showRemoteDecorations?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'update:modelValue', value: string | null): void;
	(ev: 'select', value: {
		id: string;
		name: string;
		description: string | null;
		url: string;
		host?: string | null;
		roleIdsThatCanBeUsedThisDecoration: string[];
	}): void;
}>();

const ITEMS_PER_PAGE = 20;
const localPage = ref(1);
const remotePage = ref(1);

const searchQuery = ref('');
const searchResults = ref<{
	id: string;
	name: string;
	description: string | null;
	url: string;
	host?: string | null;
	roleIdsThatCanBeUsedThisDecoration: string[];
}[]>([]);
const isSearching = ref(false);
const searchTimeout = ref<number | null>(null);

const avatarDecorations = ref<Misskey.entities.GetAvatarDecorationsResponse>([]);
const localAvatarDecorations = computed(() =>
	avatarDecorations.value.filter(d => d.host == null),
);
const remoteAvatarDecorations = computed(() =>
	avatarDecorations.value.filter(d => d.host != null),
);

const visibleLocalDecorations = computed(() =>
	localAvatarDecorations.value.slice(0, localPage.value * ITEMS_PER_PAGE),
);
const visibleRemoteDecorations = computed(() =>
	remoteAvatarDecorations.value.slice(0, remotePage.value * ITEMS_PER_PAGE),
);

const hasMoreLocalDecorations = computed(() =>
	localAvatarDecorations.value.length > visibleLocalDecorations.value.length,
);
const hasMoreRemoteDecorations = computed(() =>
	remoteAvatarDecorations.value.length > visibleRemoteDecorations.value.length,
);

// 初期データの読み込み
misskeyApi('get-avatar-decorations').then(_avatarDecorations => {
	avatarDecorations.value = _avatarDecorations;
});

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
				origin: $i?.policies.canUseRemoteIconDecorations ? 'combined' : 'local',
			});
			searchResults.value = results as {
				id: string;
				name: string;
				description: string | null;
				url: string;
				host?: string | null;
				roleIdsThatCanBeUsedThisDecoration: string[];
			}[];
		} catch (err) {
			console.error(err);
		} finally {
			isSearching.value = false;
		}
	}, 300);
}

function loadMoreLocalDecorations() {
	localPage.value++;
}

function loadMoreRemoteDecorations() {
	remotePage.value++;
}

function selectDecoration(decoration: {
	id: string;
	name: string;
	description: string | null;
	url: string;
	host?: string | null;
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
