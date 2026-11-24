<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker v-slot="slotProps" markerId="tempuraAdminIntegrations" :keywords="['llm', 'ai', 'gemini', 'deepl', 'translation', 'object', 'storage', 's3', 'external', 'integration']">
	<CategoryFolder :shouldOpen="Boolean(slotProps.isParentOfTarget) || isCategoryTarget">
		<template #icon><SearchIcon><i class="ti ti-plug"></i></SearchIcon></template>
		<template #label><SearchLabel>{{ i18n.ts._tempuraAdmin.groupIntegrations }}</SearchLabel></template>

		<div class="_gaps_m">
			<SearchMarker :label="i18n.ts._llm.title" icon="ti ti-robot" :keywords="['llm', 'ai', 'gemini', 'openai', 'api', 'model']">
				<GeminiSettings :meta="meta"/>
			</SearchMarker>
			<SearchMarker label="DeepL Free Mode" icon="ti ti-language" :keywords="['deepl', 'translate', 'translation', 'free']">
				<DeeplFreeModeSettings :meta="meta"/>
			</SearchMarker>
			<SearchMarker label="Object Storage (Remote)" icon="ti ti-cloud" :keywords="['object', 'storage', 'remote', 'cache', 'prefix', 's3']">
				<ObjectStorageRemoteSettings :meta="meta"/>
			</SearchMarker>
		</div>
	</CategoryFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import GeminiSettings from '../sections/GeminiSettings.vue';
import DeeplFreeModeSettings from '../sections/DeeplFreeModeSettings.vue';
import ObjectStorageRemoteSettings from '../sections/ObjectStorageRemoteSettings.vue';
import CategoryFolder from '../CategoryFolder.vue';
import { useIsCategorySearchTarget } from './use-category-target.js';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';

defineProps<{
	meta: Misskey.Endpoints['admin/meta']['res'];
}>();

const isCategoryTarget = useIsCategorySearchTarget('tempuraAdminIntegrations');
</script>
