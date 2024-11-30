<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<div v-if="!loading" class="_gaps">
		<MkInfo>{{ i18n.tsx._profile.avatarDecorationMax({ max: $i.policies.avatarDecorationLimit }) }} ({{ i18n.tsx.remainingN({ n: $i.policies.avatarDecorationLimit - $i.avatarDecorations.length }) }})</MkInfo>

		<MkAvatar :class="$style.avatar" :user="$i" forceShowDecoration/>

		<div v-if="$i.avatarDecorations.length > 0" v-panel :class="$style.current" class="_gaps_s">
			<div>{{ i18n.ts.inUse }}</div>
			<div :class="$style.decorations">
				<XDecoration
					v-for="(avatarDecoration, i) in $i.avatarDecorations"
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
			<template #label>ローカル</template>
			<div :class="$style.decorations">
				<XDecoration
					v-for="localAvatarDecoration in localAvatarDecorations"
					:key="localAvatarDecoration.id"
					:decoration="localAvatarDecoration"
					@click="openLocalDecoration(localAvatarDecoration)"
				/>
			</div>
		</MkFolder>
		<MkFolder v-if="$i.policies.canUseRemoteIconDecorations">
			<template #label>リモート</template>
			<div :class="$style.decorations">
				<template v-for="(chunk, index) in remoteDecorationChunks" :key="index">
					<XDecoration
						v-for="remoteAvatarDecoration in remoteAvatarDecorations"
						:key="remoteAvatarDecoration.id"
						:decoration="remoteAvatarDecoration"
						@click="openRemoteDecoration(remoteAvatarDecoration)"
					/>
				</template>
			</div>
		</MkFolder>
	</div>
	<div v-else>
		<MkLoading/>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, defineAsyncComponent, computed, onMounted, onUnmounted } from 'vue';
import * as Misskey from 'misskey-js';
import XDecoration from './avatar-decoration.decoration.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { i18n } from '@/i18n.js';
import { signinRequired } from '@/account.js';
import MkInfo from '@/components/MkInfo.vue';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import MkFolder from '@/components/MkFolder.vue';

const $i = signinRequired();
const CHUNK_SIZE = 12; // 一度に表示する装飾の数

const loading = ref(true);
const avatarDecorations = ref<Misskey.entities.GetAvatarDecorationsResponse>([]);
const localAvatarDecorations = ref<Misskey.entities.GetAvatarDecorationsResponse>([]);
const remoteAvatarDecorations = ref<Misskey.entities.GetAvatarDecorationsResponse>([]);
const remoteContainer = ref<HTMLElement | null>(null);
const visibleChunks = ref<Record<number, boolean>>({});

// リモートの装飾をチャンクに分割
const remoteDecorationChunks = computed(() => {
	const chunks = [];
	for (let i = 0; i < remoteAvatarDecorations.value.length; i += CHUNK_SIZE) {
		chunks.push(remoteAvatarDecorations.value.slice(i, i + CHUNK_SIZE));
	}
	return chunks;
});

// Intersection Observerの設定
let observer: IntersectionObserver | null = null;

onMounted(() => {
	observer = new IntersectionObserver((entries) => {
		entries.forEach(entry => {
			if (entry.isIntersecting) {
				// 表示範囲に入ったチャンクを表示
				const containerRect = remoteContainer.value?.getBoundingClientRect();
				if (containerRect) {
					remoteDecorationChunks.value.forEach((_, index) => {
						const chunkTop = index * (containerRect.height / remoteDecorationChunks.value.length);
						const chunkBottom = (index + 1) * (containerRect.height / remoteDecorationChunks.value.length);
						if (chunkTop <= entry.boundingClientRect.bottom && chunkBottom >= entry.boundingClientRect.top) {
							visibleChunks.value[index] = true;
						}
					});
				}
			}
		});
	}, {
		root: null,
		rootMargin: '100px',
		threshold: 0.1
	});

	if (remoteContainer.value) {
		observer.observe(remoteContainer.value);
	}
});

onUnmounted(() => {
	observer?.disconnect();
});

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

definePageMetadata(() => ({
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
