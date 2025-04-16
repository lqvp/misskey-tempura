<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader :actions="headerActions" :tabs="headerTabs"/></template>
	<MkSpacer :contentMax="800">
		<div class="_gaps">
			<MkAvatarDecorationSelect
				v-model="selectedDecoration"
				@select="openDecoration"
			/>

			<div v-if="!loading" class="_gaps">
				<MkFolder>
					<template #label>{{ i18n.ts.local }}</template>
					<div :class="$style.decorations">
						<XDecoration
							v-for="localAvatarDecoration in visibleLocalDecorations"
							:key="localAvatarDecoration.id"
							:decoration="localAvatarDecoration"
							@click="openLocalDecoration(localAvatarDecoration)"
						/>
					</div>
					<MkButton v-if="hasMoreLocalDecorations" class="mt-4" @click="loadMoreLocalDecorations">
						{{ i18n.ts.loadMore }}
					</MkButton>
				</MkFolder>

				<MkFolder>
					<template #label>{{ i18n.ts.remote }}</template>
					<div :class="$style.decorations">
						<XDecoration
							v-for="remoteAvatarDecoration in visibleRemoteDecorations"
							:key="remoteAvatarDecoration.id"
							:decoration="remoteAvatarDecoration"
							@click="openRemoteDecoration(remoteAvatarDecoration)"
						/>
					</div>
					<MkButton v-if="hasMoreRemoteDecorations" class="mt-4" @click="loadMoreRemoteDecorations">
						{{ i18n.ts.loadMore }}
					</MkButton>
				</MkFolder>
			</div>
			<div v-else>
				<MkLoading/>
			</div>
		</div>
	</MkSpacer>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { ref, computed, defineAsyncComponent } from 'vue';
import * as Misskey from 'misskey-js';
import { ensureSignin } from '@/i.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import XDecoration from '@/pages/settings/avatar-decoration.decoration.vue';
import MkAvatarDecorationSelect from '@/components/MkAvatarDecorationSelect.vue';

const $i = ensureSignin();

const ITEMS_PER_PAGE = 20;
const localPage = ref(1);
const remotePage = ref(1);
const selectedDecoration = ref<string | null>(null);

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

const hasMoreLocalDecorations = computed(() =>
	localDecorations.value.length > visibleLocalDecorations.value.length,
);

const hasMoreRemoteDecorations = computed(() =>
	remoteDecorations.value.length > visibleRemoteDecorations.value.length,
);

function load() {
	misskeyApi('admin/avatar-decorations/list').then(_avatarDecorations => {
		avatarDecorations.value = _avatarDecorations;
	});
}

function loadMoreLocalDecorations() {
	localPage.value++;
}

function loadMoreRemoteDecorations() {
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
