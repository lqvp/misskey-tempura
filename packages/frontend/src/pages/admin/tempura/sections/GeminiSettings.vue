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
		<MkFormFooter :form="guardedForm"/>
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
		<MkInput v-model="form.state.llmUsageRetentionMonths" type="number" :min="0" :max="2147483647" :step="1">
			<template #label>{{ i18n.ts._llmUsage.retention }}</template>
			<template #caption>{{ i18n.ts._llmUsage.retentionDescription }}</template>
		</MkInput>
		<MkA to="/admin/llm-usage" class="_link">{{ i18n.ts._llmUsage.title }}</MkA>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isRetentionShortening, retentionBoundary } from '@/utility/tempura-script/llm-usage.js';
import { useForm } from '@/composables/use-form.js';
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
	llmUsageRetentionMonths: props.meta.llmUsageRetentionMonths,
	serverGeminiEnabled: props.meta.serverGeminiEnabled,
	serverGeminiApiKey: props.meta.serverGeminiApiKey ?? '',
	serverGeminiModels: props.meta.serverGeminiModels || 'gemini-2.0-flash',
}, async (state) => {
	const current = await misskeyApi('admin/meta', {});
	if (current.llmUsageRetentionMonths !== form.savedState.llmUsageRetentionMonths) {
		if (!form.modifiedStates.llmUsageRetentionMonths) form.state.llmUsageRetentionMonths = current.llmUsageRetentionMonths;
		form.savedState.llmUsageRetentionMonths = current.llmUsageRetentionMonths;
		await os.alert({ type: 'warning', text: i18n.ts._llmUsage.conflict });
		throw new Error('CANCELED');
	}
	if (!Number.isInteger(state.llmUsageRetentionMonths) || state.llmUsageRetentionMonths < 0 || state.llmUsageRetentionMonths > 2147483647) {
		await os.alert({ type: 'error', text: i18n.ts.invalidValue });
		throw new Error('CANCELED');
	}
	let expectedBoundary: string | undefined;
	if (isRetentionShortening(current.llmUsageRetentionMonths, state.llmUsageRetentionMonths)) {
		try {
			const { pong } = await misskeyApi('ping', {});
			if (!Number.isFinite(pong) || !Number.isFinite(new Date(pong).getTime())) throw new Error(i18n.ts.invalidValue);
			expectedBoundary = retentionBoundary(new Date(pong), state.llmUsageRetentionMonths);
		} catch {
			await os.alert({ type: 'error', text: i18n.ts._llmUsage.serverDateUnavailable });
			throw new Error('CANCELED');
		}
		const { canceled } = await os.confirm({ type: 'warning', text: i18n.tsx._llmUsage.shorten({ date: expectedBoundary }) });
		if (canceled) throw new Error('CANCELED');
	}
	try {
		await os.apiWithDialog('admin/update-meta', {
			llmUsageRetentionMonths: state.llmUsageRetentionMonths,
			expectedLlmUsageRetentionMonths: current.llmUsageRetentionMonths,
			expectedLlmUsageRetentionBoundary: expectedBoundary,
			serverGeminiEnabled: state.serverGeminiEnabled,
			serverGeminiApiKey: state.serverGeminiApiKey,
			serverGeminiModels: state.serverGeminiModels,
		}, undefined, {
			'44670c6f-a32d-49d0-a5ba-93df7c3f25ea': { text: i18n.ts._llmUsage.boundaryChanged },
			'88be203a-5191-4bb8-91c4-173770d32fbd': { text: i18n.ts._llmUsage.conflict },
		});
	} catch (error) {
		if ((error as { code?: string }).code === 'RETENTION_BOUNDARY_CHANGED') {
			throw new Error('CANCELED');
		}
		if ((error as { code?: string }).code === 'RETAINED_SETTINGS_CHANGED') {
			const latest = await misskeyApi('admin/meta', {});
			if (!form.modifiedStates.llmUsageRetentionMonths) form.state.llmUsageRetentionMonths = latest.llmUsageRetentionMonths;
			form.savedState.llmUsageRetentionMonths = latest.llmUsageRetentionMonths;
		}
		throw error;
	}
	fetchInstance(true);
});
const guardedForm = {
	...form,
	async save() {
		try { await form.save(); } catch (error) { if (!(error instanceof Error && error.message === 'CANCELED')) throw error; }
	},
};
</script>
