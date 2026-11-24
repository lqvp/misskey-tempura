<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker markerId="tempura-settings-behavior" :inlining="['tempura-settings-root']" path="/settings/tempura-settings" :keywords="['behavior', 'interaction', 'actions', 'default']">
	<MkFolder>
		<template #icon><i class="ti ti-mood-happy"></i></template>
		<template #label><SearchLabel>{{ i18n.ts.behavior }}</SearchLabel></template>
		<div class="_gaps_m">
			<div class="_gaps_m">
				<MkPreferenceContainer k="reactionChecksMuting">
					<SearchMarker :keywords="['reaction', 'muting', 'block', 'ignore', 'notifications']">
						<MkSwitch v-model="reactionChecksMuting">
							<SearchLabel>{{ i18n.ts._reactionChecksMuting.title }}</SearchLabel>
							<template #caption>{{ i18n.ts._reactionChecksMuting.caption }}</template>
						</MkSwitch>
					</SearchMarker>
				</MkPreferenceContainer>

				<MkPreferenceContainer k="anonymizeMutedUsers">
					<SearchMarker :keywords="['anonymize', 'muted', 'users']">
						<MkSwitch v-model="anonymizeMutedUsers">
							<SearchLabel>{{ i18n.ts._anonymizeMutedUsers.title }}</SearchLabel>
							<template #caption>{{ i18n.ts._anonymizeMutedUsers.caption }}</template>
						</MkSwitch>
					</SearchMarker>
				</MkPreferenceContainer>

				<MkPreferenceContainer k="mediaProxy">
					<SearchMarker :keywords="['media', 'proxy', 'image', 'url']">
						<MkInput :modelValue="mediaProxyDraft" type="url" manualSave @update:modelValue="onSaveMediaProxy" @change="onEditMediaProxy">
							<template #prefix><i class="ti ti-link"></i></template>
							<template #label><SearchLabel>{{ i18n.ts._mediaProxySetting.url }}</SearchLabel></template>
							<template #caption>{{ i18n.ts._mediaProxySetting.clientDescription }}</template>
						</MkInput>
						<MkInfo v-if="mediaProxyValidationError != null" warn>{{ mediaProxyValidationError }}</MkInfo>
					</SearchMarker>
				</MkPreferenceContainer>
			</div>
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { url } from '@@/js/config.js';
import { validateMediaProxyUrl } from '@@/js/media-proxy.js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import MkPreferenceContainer from '@/components/MkPreferenceContainer.vue';

const reactionChecksMuting = prefer.model('reactionChecksMuting');
const anonymizeMutedUsers = prefer.model('anonymizeMutedUsers');
const mediaProxyDraft = ref(prefer.s.mediaProxy ?? '');
/** 編集中の入力値 (manualSave では保存するまで親に渡らないため、change から拾って検証に使う) */
const mediaProxyEditing = ref<string | null>(null);

function onEditMediaProxy(ev: Event) {
	const target = ev.target as HTMLInputElement | null;
	mediaProxyEditing.value = target?.value ?? null;
}

function errorText(reason: 'invalid' | 'self' | 'insecure'): string {
	switch (reason) {
		case 'self': return i18n.ts._mediaProxySetting.selfUrl;
		case 'insecure': return i18n.ts._mediaProxySetting.insecureUrl;
		default: return i18n.ts._mediaProxySetting.invalidUrl;
	}
}

// 入力に追従して即座に理由を出す (保存を押した後だけ警告が出ると直し方が分からないため)
const mediaProxyValidationError = computed(() => {
	const raw = mediaProxyEditing.value ?? mediaProxyDraft.value;
	const result = validateMediaProxyUrl(raw, url);
	return result.ok ? null : errorText(result.reason);
});

watch(prefer.r.mediaProxy, (value) => {
	mediaProxyDraft.value = value ?? '';
	mediaProxyEditing.value = null;
});

function onSaveMediaProxy(value: string) {
	const result = validateMediaProxyUrl(value, url);
	if (!result.ok) {
		void os.alert({
			type: 'error',
			text: errorText(result.reason),
		});
		// 拒否した値は入力欄に残さず、確定済みの値へ戻す
		mediaProxyDraft.value = prefer.s.mediaProxy ?? '';
		return;
	}

	prefer.commit('mediaProxy', result.normalized);
	mediaProxyDraft.value = result.normalized ?? '';
	mediaProxyEditing.value = null;
}
</script>
