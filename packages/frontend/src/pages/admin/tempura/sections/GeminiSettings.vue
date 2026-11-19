<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
	<MkFolder>
		<template #icon><i class="ti ti-robot"></i></template>
		<template #label>{{ i18n.ts._llm.title }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
		<template v-if="form.savedState.serverOpenAIEnabled" #suffix>Enabled</template>
		<template v-else #suffix>Disabled</template>
		<template v-if="form.modified.value" #footer>
			<MkFormFooter :form="form"/>
		</template>

		<div class="_gaps">
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

			<div class="_gaps_s">
				<MkSelect v-if="modelItems.length > 0" v-model="form.state.serverOpenAIModels" :items="modelItems">
					<template #label>{{ i18n.ts._llm._server.serverOpenAIModels }}</template>
					<template #caption>
						<span v-if="selectedModel?.imageInput === 'supported'">{{ i18n.ts._llm.modelImageSupported }}</span>
						<span v-else-if="selectedModel?.imageInput === 'unsupported'">{{ i18n.ts._llm.modelImageUnsupported }}</span>
						<span v-else-if="selectedModel?.imageInput === 'unknown'">{{ i18n.ts._llm.modelImageUnknown }}</span>
					</template>
				</MkSelect>
				<MkInput v-else v-model="form.state.serverOpenAIModels" type="text">
					<template #label>{{ i18n.ts._llm._server.serverOpenAIModels }}</template>
					<template #caption>{{ i18n.ts._llm._server.serverOpenAIModelsDescription }}</template>
				</MkInput>
				<div class="_buttons">
					<MkButton :disabled="fetchingModels" @click="fetchModels">{{ fetchingModels ? i18n.ts.loading : i18n.ts._llm.fetchModels }}</MkButton>
				</div>
				<div v-if="fetchError" class="_formCaption" style="color: var(--MI_THEME-warn);">{{ i18n.ts._llm._server.serverFetchModelsError }}</div>
			</div>
		</div>
	</MkFolder>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useForm } from '@/composables/use-form.js';
import * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { toModelInfos } from '@/utility/tempura-script/llm.js';
import type { LLMModelInfo } from '@/utility/tempura-script/llm.js';

const props = defineProps<{ meta: Misskey.Endpoints['admin/meta']['res'] }>();

const form = useForm({
	serverOpenAIEnabled: props.meta.serverOpenAIEnabled,
	serverOpenAIApiKey: props.meta.serverOpenAIApiKey ?? '',
	serverOpenAIBaseURL: props.meta.serverOpenAIBaseURL ?? '',
	serverOpenAIModels: props.meta.serverOpenAIModels || 'gpt-4o-mini',
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		serverOpenAIEnabled: state.serverOpenAIEnabled,
		serverOpenAIApiKey: state.serverOpenAIApiKey,
		serverOpenAIBaseURL: state.serverOpenAIBaseURL,
		serverOpenAIModels: state.serverOpenAIModels,
	});
	fetchInstance(true);
});

// モデル一覧 (保存済みのサーバー設定で notes/llm-models 経由で取得)
const models = ref<LLMModelInfo[]>([]);
const fetchingModels = ref(false);
const fetchError = ref(false);
const modelItems = computed(() => models.value.map((m) => ({ value: m.id, label: m.id })));
const selectedModel = computed(() => models.value.find((m) => m.id === form.state.serverOpenAIModels));

async function fetchModels(): Promise<void> {
	fetchingModels.value = true;
	fetchError.value = false;
	try {
		const res = await misskeyApi('notes/llm-models', {});
		if ((res.models ?? []).length === 0) {
			fetchError.value = true;
		} else {
			models.value = toModelInfos(res.models);
		}
	} catch {
		fetchError.value = true;
	} finally {
		fetchingModels.value = false;
	}
}
</script>
