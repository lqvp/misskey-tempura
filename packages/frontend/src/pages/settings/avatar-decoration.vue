<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/avatar-decoration" :label="i18n.ts.avatarDecorations" :keywords="['avatar', 'icon', 'decoration']" icon="ti ti-sparkles">
	<div>
		<div v-if="!loading" class="_gaps">
			<MkInfo>{{ i18n.tsx._profile.avatarDecorationMax({ max: $i.policies.avatarDecorationLimit }) }} ({{ i18n.tsx.remainingN({ n: $i.policies.avatarDecorationLimit - $i.avatarDecorations.length }) }})</MkInfo>

			<MkAvatar :class="$style.avatar" :user="$i" forceShowDecoration/>

			<div v-if="$i.avatarDecorations.length > 0" v-panel :class="$style.current" class="_gaps_s">
				<div>{{ i18n.ts.inUse }}</div>
				<div :class="$style.decorations">
					<XDecoration
						v-for="(avatarDecoration, i) in $i.avatarDecorations"
						:key="avatarDecoration.id"
						:decoration="avatarDecorations.find(d => d.id === avatarDecoration.id) ?? { id: '', url: '', name: '?', roleIdsThatCanBeUsedThisDecoration: [] }"
						:angle="avatarDecoration.angle"
						:flipH="avatarDecoration.flipH"
						:offsetX="avatarDecoration.offsetX"
						:offsetY="avatarDecoration.offsetY"
						:showBehind="avatarDecoration.showBehind"
						:active="true"
						@click="openAttachedDecoration(i)"
					/>
				</div>

				<MkButton danger @click="detachAllDecorations">{{ i18n.ts.detachAll }}</MkButton>
			</div>

			<MkInput
				v-model="searchQuery"
				type="search"
				:placeholder="i18n.ts.search"
				@update:modelValue="onSearchInput"
			>
				<template #prefix><i class="ti ti-search"></i></template>
			</MkInput>

			<MkRadios
				v-if="canUseRemote"
				v-model="searchOrigin"
				:options="originOptions"
				@update:modelValue="onOriginChange"
			/>

			<template v-if="isSearching && searchResults.length === 0">
				<MkLoading/>
			</template>

			<template v-else>
				<div v-if="searchResults.length === 0">
					<MkInfo>{{ i18n.ts.noResults }}</MkInfo>
				</div>
				<template v-for="[category, decorations] in Object.entries(groupedDecorations)" :key="category">
					<MkFolder v-if="category" :defaultOpen="category === defaultCategory">
						<template #label>{{ category }}</template>
						<div :class="$style.decorations">
							<XDecoration
								v-for="avatarDecoration in decorations"
								:key="avatarDecoration.id"
								:decoration="avatarDecoration"
								@click="openDecoration(avatarDecoration)"
							/>
						</div>
					</MkFolder>
					<div v-else :class="$style.decorations">
						<XDecoration
							v-for="avatarDecoration in decorations"
							:key="avatarDecoration.id"
							:decoration="avatarDecoration"
							@click="openDecoration(avatarDecoration)"
						/>
					</div>
				</template>
				<MkButton v-if="canLoadMore" @click="loadMore">{{ i18n.ts.loadMore }}</MkButton>
			</template>
		</div>
		<div v-else>
			<MkLoading/>
		</div>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import XDecoration from './avatar-decoration.decoration.vue';
import XDialog from './avatar-decoration.dialog.vue';
import MkButton from '@/components/MkButton.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkFolder from '@/components/MkFolder.vue';
import { definePage } from '@/page.js';
import { groupAvatarDecorations } from '@/utility/group-avatar-decorations.js';

const $i = ensureSignin();

const loading = ref(true);
const avatarDecorations = ref<Misskey.entities.GetAvatarDecorationsResponse>([]);

// 検索: search-avatar-decorations エンドポイントを利用する
type DecorationItem = {
	id: string;
	name: string;
	description?: string | null;
	url: string;
	roleIdsThatCanBeUsedThisDecoration: string[];
	category?: string | null;
};

const PAGE_SIZE = 50;
let searchRequestId = 0;

const searchQuery = ref('');
const canUseRemote = $i.policies.canUseRemoteIconDecorations === true;
const searchOrigin = ref<'local' | 'remote' | 'combined'>(canUseRemote ? 'combined' : 'local');
const searchResults = ref<DecorationItem[]>([]);
const isSearching = ref(false);
const canLoadMore = ref(false);
let searchTimeout: number | null = null;

const originOptions = computed(() => {
	const options: { value: 'local' | 'remote' | 'combined'; label: string }[] = [
		{ value: 'local', label: i18n.ts.local },
	];
	if (canUseRemote) {
		options.push(
			{ value: 'remote', label: i18n.ts.remote },
			{ value: 'combined', label: i18n.ts.all },
		);
	}
	return options;
});

// 検索結果もカテゴリで分组する
const groupedDecorations = computed(() => groupAvatarDecorations(searchResults.value));
const defaultCategory = computed(() => Object.keys(groupedDecorations.value)[0] ?? '');

// 一度に大量のデコレーションを描画するとクライアントがクラッシュするため、
// エンドポイントの limit/offset で少しずつ読み込む
async function fetchDecorations(): Promise<void> {
	const id = ++searchRequestId;
	const offset = searchResults.value.length;
	isSearching.value = true;
	try {
		const results = await misskeyApi('search-avatar-decorations', {
			query: searchQuery.value,
			origin: searchOrigin.value,
			limit: PAGE_SIZE,
			offset,
		});
		if (id !== searchRequestId) return; // 途中で検索条件が変わった場合は破棄
		searchResults.value = offset === 0 ? results : [...searchResults.value, ...results];
		canLoadMore.value = results.length === PAGE_SIZE;
	} catch (err) {
		if (id === searchRequestId) console.error(err);
	} finally {
		if (id === searchRequestId) isSearching.value = false;
	}
}

function loadMore() {
	if (isSearching.value) return;
	void fetchDecorations();
}

function onSearchInput() {
	if (searchTimeout != null) {
		window.clearTimeout(searchTimeout);
	}
	searchResults.value = [];
	canLoadMore.value = false;
	searchTimeout = window.setTimeout(fetchDecorations, 300);
}

function onOriginChange() {
	if (searchTimeout != null) {
		window.clearTimeout(searchTimeout);
	}
	searchResults.value = [];
	canLoadMore.value = false;
	void fetchDecorations();
}

// Initial data loading
misskeyApi('get-avatar-decorations').then(_avatarDecorations => {
	avatarDecorations.value = _avatarDecorations;
	loading.value = false;
});

// グリッドの最初の1ページを取得する
void fetchDecorations();

function openAttachedDecoration(index: number) {
	openDecoration(avatarDecorations.value.find(d => d.id === $i.avatarDecorations[index].id) ?? { id: '', url: '', name: '?', roleIdsThatCanBeUsedThisDecoration: [] }, index);
}

async function openDecoration(avatarDecoration: {
	id: string;
	url: string;
	name: string;
	roleIdsThatCanBeUsedThisDecoration: string[];
}, index?: number) {
	const { dispose } = os.popup(XDialog, {
		decoration: avatarDecoration,
		usingIndex: index ?? null,
	}, {
		'attach': async (payload) => {
			const newDecoration = {
				id: avatarDecoration.id,
				url: avatarDecoration.url,
				angle: payload.angle,
				flipH: payload.flipH,
				offsetX: payload.offsetX,
				offsetY: payload.offsetY,
				showBehind: payload.showBehind,
			};
			const update = [...$i.avatarDecorations, newDecoration];
			await os.apiWithDialog('i/update', {
				avatarDecorations: update,
			});
			$i.avatarDecorations = update;
		},
		'update': async (payload) => {
			if (index === undefined) return;
			const newDecoration = {
				id: avatarDecoration.id,
				url: avatarDecoration.url,
				angle: payload.angle,
				flipH: payload.flipH,
				offsetX: payload.offsetX,
				offsetY: payload.offsetY,
				showBehind: payload.showBehind,
			};
			const update = [...$i.avatarDecorations];
			update[index!] = newDecoration;
			await os.apiWithDialog('i/update', {
				avatarDecorations: update,
			});
			$i.avatarDecorations = update;
		},
		'detach': async () => {
			if (index === undefined) return;
			const update = [...$i.avatarDecorations];
			update.splice(index!, 1);
			await os.apiWithDialog('i/update', {
				avatarDecorations: update,
			});
			$i.avatarDecorations = update;
		},
		closed: () => dispose(),
	});
}

function detachAllDecorations() {
	os.confirm({
		type: 'warning',
		text: i18n.ts.areYouSure,
	}).then(async ({ canceled }) => {
		if (canceled) return;
		await os.apiWithDialog('i/update', {
			avatarDecorations: [],
		});
		$i.avatarDecorations = [];
	});
}

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.avatarDecorations,
	icon: 'ti ti-sparkles',
}));
</script>

<style lang="scss" module>
.avatar {
	display: inline-block;
	width: 72px;
	height: 72px;
	margin: 16px auto;
}

.current {
	padding: 16px;
	border-radius: var(--MI-radius);
}

.decorations {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
	grid-gap: 12px;
}
</style>
