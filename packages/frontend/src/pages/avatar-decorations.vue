<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader :actions="headerActions" :tabs="headerTabs"/></template>
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<div class="_gaps">
			<MkInput
				v-model="searchQuery"
				type="search"
				:placeholder="i18n.ts.search"
				@update:modelValue="onSearchInput"
			>
				<template #prefix><i class="ti ti-search"></i></template>
			</MkInput>

			<MkRadios
				v-model="searchOrigin"
				:options="originOptions"
				@update:modelValue="onOriginChange"
			/>

			<MkLoading v-if="isSearching && avatarDecorations.length === 0"/>

			<template v-else>
				<div v-if="avatarDecorations.length === 0" class="_gaps_s">
					<template v-if="searchError">
						<MkInfo warn>{{ i18n.ts.searchFailed }}</MkInfo>
						<MkButton inline rounded style="margin: 0 auto;" @click="fetchDecorations(0)"><i class="ti ti-reload"></i> {{ i18n.ts.retry }}</MkButton>
					</template>
					<MkInfo v-else>{{ i18n.ts.noResults }}</MkInfo>
				</div>

				<div :class="$style.decorations">
					<div
						v-for="avatarDecoration in avatarDecorations"
						:key="avatarDecoration.id"
						v-panel
						:class="$style.decoration"
						@click="edit(avatarDecoration)"
					>
						<div :class="$style.decorationName"><MkCondensedLine :minScale="0.5">{{ avatarDecoration.name }}</MkCondensedLine></div>
						<MkAvatar style="width: 60px; height: 60px;" :user="$i" :decorations="[{ url: avatarDecoration.url }]" forceShowDecoration/>
					</div>
				</div>

				<MkButton v-if="canLoadMore" :disabled="isSearching" style="margin: 0 auto;" @click="loadMore">{{ i18n.ts.loadMore }}</MkButton>
			</template>
		</div>
	</div>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { ref, computed, onUnmounted } from 'vue';
import * as Misskey from 'misskey-js';
import MkInput from '@/components/MkInput.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkButton from '@/components/MkButton.vue';
import { ensureSignin } from '@/i.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { groupAvatarDecorations } from '@/utility/group-avatar-decorations.js';

const $i = ensureSignin();

// 一度に大量のデコレーションを描画するとクライアントが重くなるため、
// ユーザー側の設定画面と同じく limit/offset で少しずつ読み込む
const PAGE_SIZE = 50;
let searchRequestId = 0;
let searchTimeout: number | null = null;
// サーバーから受け取った件数。表示件数は重複除外や削除で変わるので offset にはこちらを使う
let fetchedCount = 0;

type Origin = 'local' | 'remote' | 'combined';

const searchQuery = ref('');
const searchOrigin = ref<Origin>('combined');
const avatarDecorations = ref<Misskey.entities.AdminAvatarDecorationsSearchResponse>([]);
const isSearching = ref(false);
const searchError = ref(false);
const canLoadMore = ref(false);

// ダイアログのカテゴリ候補は、検索結果ではなく全件から作る (開いたときに一度だけ取得する)
let categoriesCache: string[] | null = null;

async function fetchCategories(): Promise<string[]> {
	if (categoriesCache != null) return categoriesCache;
	try {
		const all = await misskeyApi('admin/avatar-decorations/list');
		categoriesCache = Object.keys(groupAvatarDecorations(all)).filter(c => c !== '');
		return categoriesCache;
	} catch (err) {
		// 候補が出ないだけなのでダイアログは開けるようにする
		console.error(err);
		return [];
	}
}

const originOptions = computed<{ value: Origin; label: string }[]>(() => [
	{ value: 'combined', label: i18n.ts.all },
	{ value: 'local', label: i18n.ts.local },
	{ value: 'remote', label: i18n.ts.remote },
]);

async function fetchDecorations(offset = fetchedCount): Promise<void> {
	const id = ++searchRequestId;
	isSearching.value = true;
	if (offset === 0) searchError.value = false;
	try {
		const results = await misskeyApi('admin/avatar-decorations/search', {
			query: searchQuery.value,
			origin: searchOrigin.value,
			limit: PAGE_SIZE,
			offset,
		});
		if (id !== searchRequestId) return; // 途中で検索条件が変わった場合は破棄
		fetchedCount = offset + results.length;
		if (offset === 0) {
			avatarDecorations.value = results;
		} else {
			// 編集で並び順が変わった場合などにページ境界で重複しうるので id で除外する
			const loadedIds = new Set(avatarDecorations.value.map(d => d.id));
			avatarDecorations.value = [...avatarDecorations.value, ...results.filter(d => !loadedIds.has(d.id))];
		}
		canLoadMore.value = results.length === PAGE_SIZE;
	} catch (err) {
		if (id === searchRequestId) {
			// 最初のページの失敗は「結果なし」と区別できるようエラー状態を保持する
			if (offset === 0) {
				searchError.value = true;
			} else {
				os.toast(i18n.ts.searchFailed);
			}
			console.error(err);
		}
	} finally {
		if (id === searchRequestId) isSearching.value = false;
	}
}

function resetResults() {
	searchRequestId++;
	if (searchTimeout != null) {
		window.clearTimeout(searchTimeout);
		searchTimeout = null;
	}
	avatarDecorations.value = [];
	fetchedCount = 0;
	canLoadMore.value = false;
}

function onSearchInput() {
	resetResults();
	isSearching.value = true;
	searchTimeout = window.setTimeout(() => { void fetchDecorations(0); }, 300);
}

function onOriginChange() {
	resetResults();
	void fetchDecorations(0);
}

function loadMore() {
	if (isSearching.value) return;
	void fetchDecorations();
}

void fetchDecorations(0);

onUnmounted(() => {
	if (searchTimeout != null) window.clearTimeout(searchTimeout);
	searchRequestId++;
});

async function add(ev: PointerEvent) {
	const { dispose } = await os.popupAsyncWithDialog(import('./avatar-decoration-edit-dialog.vue').then(x => x.default), {
		categories: await fetchCategories(),
	}, {
		done: result => {
			if (result.created) {
				// 検索条件・並び順・ページ位置に合わせるため先頭から取り直す
				categoriesCache = null;
				resetResults();
				void fetchDecorations(0);
			}
		},
		closed: () => dispose(),
	});
}

type AvatarDecorationEditable = Pick<
	Misskey.entities.AdminAvatarDecorationsSearchResponse[number],
	'id' | 'name' | 'url' | 'category' | 'roleIdsThatCanBeUsedThisDecoration'
> & {
	description: string | null;
};

async function edit(decoration: AvatarDecorationEditable) {
	const { dispose } = await os.popupAsyncWithDialog(import('./avatar-decoration-edit-dialog.vue').then(x => x.default), {
		avatarDecoration: decoration,
		categories: await fetchCategories(),
	}, {
		done: result => {
			if (result.updated) {
				categoriesCache = null;
				const index = avatarDecorations.value.findIndex(x => x.id === decoration.id);
				if (index === -1) {
					console.warn('avatar decoration not found', decoration.id);
					return;
				}
				avatarDecorations.value[index] = {
					...avatarDecorations.value[index],
					...result.updated,
				};
			} else if (result.deleted) {
				// サーバー側の一覧も 1 件詰まるので、次ページの offset も 1 つ戻す
				categoriesCache = null;
				fetchedCount = Math.max(0, fetchedCount - 1);
				avatarDecorations.value = avatarDecorations.value.filter(x => x.id !== decoration.id);
			}
		},
		closed: () => dispose(),
	});
}

const headerActions = computed(() => [{
	asFullButton: true,
	icon: 'ti ti-plus',
	text: i18n.ts.add,
	handler: add,
}]);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.avatarDecorations,
	icon: 'ti ti-sparkles',
}));
</script>

<style lang="scss" module>
.decorations {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
	grid-gap: 12px;
}

.decoration {
	cursor: pointer;
	padding: 16px 16px 28px 16px;
	border-radius: 8px;
	text-align: center;
	font-size: 90%;
	overflow: clip;
	contain: content;
}

.decorationName {
	position: relative;
	z-index: 10;
	font-weight: bold;
	margin-bottom: 20px;
}
</style>
