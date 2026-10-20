<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-robot"></i></template>
	<template #label>{{ i18n.ts._llm.title }}<span class="_beta">{{ i18n.ts.originalFeature }}</span></template>
	<template v-if="form.savedState.serverGeminiEnabled" #suffix>Enabled</template>
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
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		serverGeminiEnabled: state.serverGeminiEnabled,
		serverGeminiApiKey: state.serverGeminiApiKey,
		serverGeminiModels: state.serverGeminiModels,
	});
	fetchInstance(true);
});
</script>
