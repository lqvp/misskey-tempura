<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader :actions="headerActions" :tabs="headerTabs"/></template>
	<MkSpacer :contentMax="900">
		<div class="_gaps">
			<MkFolder>
				<template #label>{{ i18n.ts.local }}</template>
				<div :class="$style.decorations">
					<div
						v-for="localDecoration in visibleLocalDecorations"
						:key="localDecoration.id"
						v-panel
						:class="$style.decoration"
						@click="edit(localDecoration)"
					>
						<div :class="$style.decorationName"><MkCondensedLine :minScale="0.5">{{ localDecoration.name }}</MkCondensedLine></div>
						<MkAvatar style="width: 60px; height: 60px;" :user="$i" :decorations="[{ url: localDecoration.url }]" forceShowDecoration/>
					</div>
				</div>
				<MkButton v-if="hasMoreLocal" class="mt-4" @click="loadMoreLocal">
					{{ i18n.ts.loadMore }}
				</MkButton>
			</MkFolder>

			<MkFolder>
				<template #label>{{ i18n.ts.remote }}</template>
				<div :class="$style.decorations">
					<div
						v-for="remoteDecoration in visibleRemoteDecorations"
						:key="remoteDecoration.id"
						v-panel
						:class="$style.decoration"
						@click="edit(remoteDecoration)"
					>
						<div :class="$style.decorationName"><MkCondensedLine :minScale="0.5">{{ remoteDecoration.name }}</MkCondensedLine></div>
						<MkAvatar style="width: 60px; height: 60px;" :user="$i" :decorations="[{ url: remoteDecoration.url }]" forceShowDecoration/>
					</div>
				</div>
				<MkButton v-if="hasMoreRemote" class="mt-4" @click="loadMoreRemote">
					{{ i18n.ts.loadMore }}
				</MkButton>
			</MkFolder>
		</div>
	</MkSpacer>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { ref, computed, defineAsyncComponent } from 'vue';
import * as Misskey from 'misskey-js';
import { signinRequired } from '@/account.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';

const $i = signinRequired();

const ITEMS_PER_PAGE = 50;
const localPage = ref(1);
const remotePage = ref(1);

const avatarDecorations = ref<Misskey.entities.AdminAvatarDecorationsListResponse>([]);

const localDecorations = computed(() =>
	avatarDecorations.value.filter(d => !d.name.includes('import_')),
);

const remoteDecorations = computed(() =>
	avatarDecorations.value.filter(d => d.name.includes('import_')),
);

const visibleLocalDecorations = computed(() =>
	localDecorations.value.slice(0, localPage.value * ITEMS_PER_PAGE),
);

const visibleRemoteDecorations = computed(() =>
	remoteDecorations.value.slice(0, remotePage.value * ITEMS_PER_PAGE),
);

const hasMoreLocal = computed(() =>
	localDecorations.value.length > visibleLocalDecorations.value.length,
);

const hasMoreRemote = computed(() =>
	remoteDecorations.value.length > visibleRemoteDecorations.value.length,
);

function load() {
	misskeyApi('admin/avatar-decorations/list').then(_avatarDecorations => {
		avatarDecorations.value = _avatarDecorations;
	});
}

function loadMoreLocal() {
	localPage.value++;
}

function loadMoreRemote() {
	remotePage.value++;
}

load();

async function add(ev: MouseEvent) {
	const { dispose } = os.popup(defineAsyncComponent(() => import('./avatar-decoration-edit-dialog.vue')), {
	}, {
		done: result => {
			if (result.created) {
				avatarDecorations.value.unshift(result.created);
			}
		},
		closed: () => dispose(),
	});
}

function edit(avatarDecoration) {
	const { dispose } = os.popup(defineAsyncComponent(() => import('./avatar-decoration-edit-dialog.vue')), {
		avatarDecoration: avatarDecoration,
	}, {
		done: result => {
			if (result.updated) {
				const index = avatarDecorations.value.findIndex(x => x.id === avatarDecoration.id);
				avatarDecorations.value[index] = {
					...avatarDecorations.value[index],
					...result.updated,
				};
			} else if (result.deleted) {
				avatarDecorations.value = avatarDecorations.value.filter(x => x.id !== avatarDecoration.id);
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

definePageMetadata(() => ({
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
