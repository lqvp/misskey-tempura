<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-shield-check"></i></template>
	<template #label>{{ i18n.ts.openLlmModeration }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
	<template v-if="form.modified.value" #footer>
		<MkFormFooter :form="form"/>
	</template>

	<div class="_gaps_m">
		<MkSwitch v-model="form.state.openLlmModerationEnabled">
			<template #label>{{ i18n.ts.openLlmModerationEnabled }}</template>
			<template #caption>{{ i18n.ts.openLlmModerationDescription }}</template>
		</MkSwitch>

		<MkInput v-model="form.state.openLlmModerationApiKey" type="password">
			<template #label>{{ i18n.ts.openLlmModerationApiKey }}</template>
			<template #caption>{{ i18n.ts.openLlmModerationApiKeyDescription }}</template>
		</MkInput>

		<MkInput v-model="form.state.openLlmModerationApiUrl" type="url" :placeholder="defaultApiUrl">
			<template #label>{{ i18n.ts.openLlmModerationApiUrl }}</template>
			<template #caption>{{ i18n.ts.openLlmModerationApiUrlDescription }}</template>
		</MkInput>

		<MkInput v-model="form.state.openLlmModerationModel" :placeholder="defaultModel">
			<template #label>{{ i18n.ts.openLlmModerationModel }}</template>
			<template #caption>{{ i18n.ts.openLlmModerationModelDescription }}</template>
		</MkInput>

		<MkSwitch v-model="form.state.openLlmModerationIncludeRemote">
			<template #label>{{ i18n.ts.openLlmModerationIncludeRemote }}</template>
			<template #caption>{{ i18n.ts.openLlmModerationIncludeRemoteDescription }}</template>
		</MkSwitch>

		<div class="_gaps_s">
			<div>{{ i18n.ts.openLlmModerationVisibilities }}</div>
			<div style="display: flex; flex-wrap: wrap; gap: 8px;">
				<MkCheckbox
					v-for="visibility in visibilityOptions"
					:key="visibility.value"
					v-model="form.state.openLlmModerationVisibilities"
					:value="visibility.value"
				>
					{{ visibility.label }}
				</MkCheckbox>
			</div>
			<div class="_gaps_s" style="font-size: 0.85em; opacity: 0.8;">{{ i18n.ts.openLlmModerationVisibilitiesDescription }}</div>
		</div>

		<FormLink to="/admin/llm-moderation">{{ i18n.ts.openLlmModerationQueueLink }}</FormLink>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { defaultOpenLlmModerationApiUrl, defaultOpenLlmModerationModel, defaultOpenLlmModerationVisibilities, normalizeOpenLlmModerationVisibilities } from '../../moderation.llm.js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkCheckbox from '@/components/MkCheckbox.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import FormLink from '@/components/form/link.vue';
import * as os from '@/os.js';
import { useForm } from '@/composables/use-form.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const defaultApiUrl = defaultOpenLlmModerationApiUrl;
const defaultModel = defaultOpenLlmModerationModel;

const normalizedEnabled = props.meta.openLlmModerationEnabled ?? false;
const normalizedIncludeRemote = props.meta.openLlmModerationIncludeRemote ?? false;
const normalizedVisibilities = normalizeOpenLlmModerationVisibilities(props.meta.openLlmModerationVisibilities);

const visibilityLabels = i18n.ts._visibility as Record<string, string>;
const visibilityOptions = defaultOpenLlmModerationVisibilities.map((value) => ({
	value,
	label: visibilityLabels[value] ?? value,
}));

const apiKeyChanged = ref(false);

const form = useForm({
	openLlmModerationEnabled: normalizedEnabled,
	openLlmModerationApiKey: '',
	openLlmModerationApiUrl: props.meta.openLlmModerationApiUrl ?? '',
	openLlmModerationModel: props.meta.openLlmModerationModel ?? '',
	openLlmModerationIncludeRemote: normalizedIncludeRemote,
	openLlmModerationVisibilities: normalizedVisibilities,
}, async (state) => {
	const trimmedApiUrl = state.openLlmModerationApiUrl.trim();
	const trimmedModel = state.openLlmModerationModel.trim();
	const payload: Misskey.Endpoints['admin/update-meta']['req'] = {
		openLlmModerationEnabled: state.openLlmModerationEnabled,
		openLlmModerationApiUrl: trimmedApiUrl === '' ? null : trimmedApiUrl,
		openLlmModerationModel: trimmedModel === '' ? null : trimmedModel,
		openLlmModerationIncludeRemote: state.openLlmModerationIncludeRemote,
		openLlmModerationVisibilities: state.openLlmModerationVisibilities as Misskey.Endpoints['admin/update-meta']['req']['openLlmModerationVisibilities'],
	};
	if (form.modifiedStates.openLlmModerationApiKey) {
		const trimmedApiKey = state.openLlmModerationApiKey.trim();
		payload.openLlmModerationApiKey = trimmedApiKey === '' ? null : trimmedApiKey;
	}
	await os.apiWithDialog('admin/update-meta', payload);
	fetchInstance(true);
});

</script>
