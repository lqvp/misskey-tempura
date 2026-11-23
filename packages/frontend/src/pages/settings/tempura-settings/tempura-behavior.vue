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
						<MkInput :modelValue="mediaProxyDraft" type="url" manualSave @update:modelValue="onSaveMediaProxy">
							<template #prefix><i class="ti ti-link"></i></template>
							<template #label><SearchLabel>{{ i18n.ts._mediaProxySetting.url }}</SearchLabel></template>
							<template #caption>{{ i18n.ts._mediaProxySetting.clientDescription }}</template>
						</MkInput>
					</SearchMarker>
				</MkPreferenceContainer>
			</div>
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import { normalizeMediaProxyUrl } from '@@/js/media-proxy.js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkFolder from '@/components/MkFolder.vue';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import MkPreferenceContainer from '@/components/MkPreferenceContainer.vue';

const reactionChecksMuting = prefer.model('reactionChecksMuting');
const anonymizeMutedUsers = prefer.model('anonymizeMutedUsers');
const mediaProxyDraft = ref(prefer.s.mediaProxy ?? '');

watch(prefer.r.mediaProxy, (value) => {
	mediaProxyDraft.value = value ?? '';
});

function onSaveMediaProxy(value: string) {
	const trimmed = value.trim();
	if (trimmed === '') {
		prefer.commit('mediaProxy', null);
		mediaProxyDraft.value = '';
		return;
	}

	const normalized = normalizeMediaProxyUrl(trimmed);
	if (normalized == null) {
		void os.alert({
			type: 'error',
			text: i18n.ts._mediaProxySetting.invalidUrl,
		});
		return;
	}

	prefer.commit('mediaProxy', normalized);
	mediaProxyDraft.value = normalized;
}

</script>
