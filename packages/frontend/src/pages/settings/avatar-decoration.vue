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
						:decoration="avatarDecorations.find(d => d.id === avatarDecoration.id)"
						:angle="avatarDecoration.angle"
						:flipH="avatarDecoration.flipH"
						:offsetX="avatarDecoration.offsetX"
						:offsetY="avatarDecoration.offsetY"
						:active="true"
						@click="openDecoration(avatarDecoration, i)"
					/>
				</div>

				<MkButton danger @click="detachAllDecorations">{{ i18n.ts.detachAll }}</MkButton>
			</div>

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

		<MkFolder v-if="$i.policies.canUseRemoteIconDecorations">
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
</SearchMarker>
</template>

<script lang="ts" setup>
import { ref, defineAsyncComponent, computed } from 'vue';
import * as Misskey from 'misskey-js';
import XDecoration from './avatar-decoration.decoration.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { signinRequired } from '@/account.js';
import MkInfo from '@/components/MkInfo.vue';
import { definePage } from '@/page.js';
import MkFolder from '@/components/MkFolder.vue';

const $i = signinRequired();

const ITEMS_PER_PAGE = 20;

const loading = ref(true);
const avatarDecorations = ref<Misskey.entities.GetAvatarDecorationsResponse>([]);
const localAvatarDecorations = ref<Misskey.entities.GetAvatarDecorationsResponse>([]);
const remoteAvatarDecorations = ref<Misskey.entities.GetAvatarDecorationsResponse>([]);

const localPage = ref(1);
const remotePage = ref(1);

const visibleLocalDecorations = computed(() => {
	return localAvatarDecorations.value.slice(0, localPage.value * ITEMS_PER_PAGE);
});

const visibleRemoteDecorations = computed(() => {
	return remoteAvatarDecorations.value.slice(0, remotePage.value * ITEMS_PER_PAGE);
});

const hasMoreLocalDecorations = computed(() => {
	return localAvatarDecorations.value.length > visibleLocalDecorations.value.length;
});

const hasMoreRemoteDecorations = computed(() => {
	return remoteAvatarDecorations.value.length > visibleRemoteDecorations.value.length;
});

// Initial data loading
misskeyApi('get-avatar-decorations').then(_avatarDecorations => {
	avatarDecorations.value = _avatarDecorations;
	_avatarDecorations.forEach(item => {
		if (item.name.includes('import_')) {
			remoteAvatarDecorations.value.push(item);
		} else {
			localAvatarDecorations.value.push(item);
		}
	});
	loading.value = false;
});

function loadMoreLocalDecorations() {
	localPage.value++;
}

function loadMoreRemoteDecorations() {
	remotePage.value++;
}

function openLocalDecoration(avatarDecoration, index?: number) {
	os.popup(defineAsyncComponent(() => import('./avatar-decoration.dialog.vue')), {
		decoration: avatarDecoration,
		usingIndex: index,
	}, {
		'attach': async (payload) => {
			const decoration = {
				id: avatarDecoration.id,
				angle: payload.angle,
				flipH: payload.flipH,
				offsetX: payload.offsetX,
				offsetY: payload.offsetY,
			};
			const update = [...$i.avatarDecorations, decoration];
			await os.apiWithDialog('i/update', {
				avatarDecorations: update,
			});
			$i.avatarDecorations = update;
		},
		'update': async (payload) => {
			const decoration = {
				id: avatarDecoration.id,
				angle: payload.angle,
				flipH: payload.flipH,
				offsetX: payload.offsetX,
				offsetY: payload.offsetY,
			};
			const update = [...$i.avatarDecorations];
			update[index] = decoration;
			await os.apiWithDialog('i/update', {
				avatarDecorations: update,
			});
			$i.avatarDecorations = update;
		},
		'detach': async () => {
			const update = [...$i.avatarDecorations];
			update.splice(index, 1);
			await os.apiWithDialog('i/update', {
				avatarDecorations: update,
			});
			$i.avatarDecorations = update;
		},
	}, 'closed');
}

function openRemoteDecoration(avatarDecoration, index?: number) {
	os.popup(defineAsyncComponent(() => import('./avatar-decoration.dialog.vue')), {
		decoration: avatarDecoration,
		usingIndex: index,
	}, {
		'attach': async (payload) => {
			const decoration = {
				id: avatarDecoration.id,
				angle: payload.angle,
				flipH: payload.flipH,
				offsetX: payload.offsetX,
				offsetY: payload.offsetY,
			};
			const update = [...$i.avatarDecorations, decoration];
			await os.apiWithDialog('i/update', {
				avatarDecorations: update,
			});
			$i.avatarDecorations = update;
		},
		'update': async (payload) => {
			const decoration = {
				id: avatarDecoration.id,
				angle: payload.angle,
				flipH: payload.flipH,
				offsetX: payload.offsetX,
				offsetY: payload.offsetY,
			};
			const update = [...$i.avatarDecorations];
			update[index] = decoration;
			await os.apiWithDialog('i/update', {
				avatarDecorations: update,
			});
			$i.avatarDecorations = update;
		},
		'detach': async () => {
			const update = [...$i.avatarDecorations];
			update.splice(index, 1);
			await os.apiWithDialog('i/update', {
				avatarDecorations: update,
			});
			$i.avatarDecorations = update;
		},
	}, 'closed');
}

function openDecoration(avatarDecoration, index?: number) {
	const { dispose } = os.popup(defineAsyncComponent(() => import('./avatar-decoration.dialog.vue')), {
		decoration: avatarDecorations.value.find(d => d.id === avatarDecoration.id),
		usingIndex: index,
	}, {
		'attach': async (payload) => {
			const decoration = {
				id: avatarDecoration.id,
				angle: payload.angle,
				flipH: payload.flipH,
				offsetX: payload.offsetX,
				offsetY: payload.offsetY,
			};
			const update = [...$i.avatarDecorations, decoration];
			await os.apiWithDialog('i/update', {
				avatarDecorations: update,
			});
			$i.avatarDecorations = update;
		},
		'update': async (payload) => {
			const decoration = {
				id: avatarDecoration.id,
				angle: payload.angle,
				flipH: payload.flipH,
				offsetX: payload.offsetX,
				offsetY: payload.offsetY,
			};
			const update = [...$i.avatarDecorations];
			update[index] = decoration;
			await os.apiWithDialog('i/update', {
				avatarDecorations: update,
			});
			$i.avatarDecorations = update;
		},
		'detach': async () => {
			const update = [...$i.avatarDecorations];
			update.splice(index, 1);
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
