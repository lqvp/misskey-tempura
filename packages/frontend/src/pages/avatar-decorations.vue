<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader :actions="headerActions" :tabs="headerTabs"/></template>
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<div class="_gaps">
			<MkAvatarDecorationSelect
				v-model="selectedDecoration"
				:showLocalDecorations="true"
				:showRemoteDecorations="true"
				@select="edit"
			/>

			<div v-if="loading">
				<MkLoading/>
			</div>
		</div>
	</div>
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
import MkAvatarDecorationSelect from '@/components/MkAvatarDecorationSelect.vue';

const $i = ensureSignin();

const selectedDecoration = ref<string | null>(null);
const loading = ref(true);
const avatarDecorations = ref<Misskey.entities.AdminAvatarDecorationsListResponse>([]);

function load() {
	misskeyApi('admin/avatar-decorations/list').then(_avatarDecorations => {
		avatarDecorations.value = _avatarDecorations;
		loading.value = false;
	});
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

function edit(decoration) {
	const { dispose } = os.popup(defineAsyncComponent(() => import('./avatar-decoration-edit-dialog.vue')), {
		avatarDecoration: decoration,
	}, {
		done: result => {
			if (result.updated) {
				const index = avatarDecorations.value.findIndex(x => x.id === decoration.id);
				avatarDecorations.value[index] = {
					...avatarDecorations.value[index],
					...result.updated,
				};
			} else if (result.deleted) {
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
