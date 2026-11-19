<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
	<MkFolder>
		<template #icon><i class="ti ti-robot"></i></template>
		<template #label>{{ i18n.ts._llm.title }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
		<template v-if="form.savedState.serverGeminiEnabled || form.savedState.serverOpenAIEnabled" #suffix>Enabled</template>
		<template v-else #suffix>Disabled</template>
		<template v-if="form.modified.value" #footer>
			<MkFormFooter :form="form"/>
		</template>

		<div class="_gaps">
			<MkSwitch v-model="form.state.serverGeminiEnabled">
				<template #label>{{ i18n.ts._llm._server.serverGeminiEnabled }}</template>
				<template #caption>{{ i18n.ts._llm._server.serverGeminiEnabledDescription }}</template>
			</MkSwitch>

			<MkInput v-model="form.state.serverGeminiApiKey" type="text">
				<template #label>{{ i18n.ts._llm._server.serverGeminiApiKey }}</template>
				<template #caption>{{ i18n.ts._llm._server.serverGeminiApiKeyDescription }}</template>
			</MkInput>

			<MkSelect v-model="form.state.serverGeminiModels" :items="modelItems">
				<template #label>{{ i18n.ts._llm.geminiModelLabel }}</template>
				<template #caption>{{ i18n.ts._llm._server.serverGeminiModelsDescription }}</template>
			</MkSelect>

			<MkSwitch v-model="form.state.serverOpenAIEnabled">
				<template #label>{{ i18n.ts._llm._server.serverOpenAIEnabled }}</template>
				<template #caption>{{ i18n.ts._llm._server.serverOpenAIEnabledDescription }}</template>
			</MkSwitch>

			<MkInput v-model="form.state.serverOpenAIApiKey" type="text">
				<template #label>{{ i18n.ts._llm._server.serverOpenAIApiKey }}</template>
				<template #caption>{{ i18n.ts._llm._server.serverOpenAIApiKeyDescription }}</template>
			</MkInput>

			<MkInput v-model="form.state.serverOpenAIBaseURL" type="text">
				<template #label>{{ i18n.ts._llm._server.serverOpenAIBaseURL }}</template>
				<template #caption>{{ i18n.ts._llm._server.serverOpenAIBaseURLDescription }}</template>
			</MkInput>

			<MkInput v-model="form.state.serverOpenAIModels" type="text">
				<template #label>{{ i18n.ts._llm._server.serverOpenAIModels }}</template>
				<template #caption>{{ i18n.ts._llm._server.serverOpenAIModelsDescription }}</template>
			</MkInput>
		</div>
	</MkFolder>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useForm } from '@/composables/use-form.js';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { geminiModels } from '@/utility/tempura-script/models.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const modelItems = computed(() => geminiModels.map((model) => ({ value: model, label: model })));

const form = useForm({
	serverGeminiEnabled: props.meta.serverGeminiEnabled,
	serverGeminiApiKey: props.meta.serverGeminiApiKey ?? '',
	serverGeminiModels: props.meta.serverGeminiModels || 'gemini-2.0-flash',
	serverOpenAIEnabled: props.meta.serverOpenAIEnabled,
	serverOpenAIApiKey: props.meta.serverOpenAIApiKey ?? '',
	serverOpenAIBaseURL: props.meta.serverOpenAIBaseURL ?? '',
	serverOpenAIModels: props.meta.serverOpenAIModels || 'gpt-4o-mini',
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		serverGeminiEnabled: state.serverGeminiEnabled,
		serverGeminiApiKey: state.serverGeminiApiKey,
		serverGeminiModels: state.serverGeminiModels,
		serverOpenAIEnabled: state.serverOpenAIEnabled,
		serverOpenAIApiKey: state.serverOpenAIApiKey,
		serverOpenAIBaseURL: state.serverOpenAIBaseURL,
		serverOpenAIModels: state.serverOpenAIModels,
	});
	fetchInstance(true);
});
</script>
