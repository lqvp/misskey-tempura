<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-robot"></i></template>
	<template #label>{{ i18n.ts._llm.title }}</template>

	<div class="_gaps_m">
		<MkInput v-model="geminiToken" type="text">
			<template #label>{{ i18n.ts._llm.geminiTokenLabel }}</template>
			<template #caption>{{ i18n.ts._llm.geminiTokenCaption }}</template>
		</MkInput>

		<MkSelect v-model="geminiModels">
			<template #label>{{ i18n.ts._llm.geminiModelLabel }}</template>
			<option value="gemini-2.0-flash">gemini-2.0-flash</option>
			<option value="gemini-1.5-flash">gemini-1.5-flash</option>
			<option value="gemini-1.5-pro">gemini-1.5-pro</option>
			<option value="gemini-2.0-pro-exp-02-05">gemini-2.0-pro-exp-02-05</option>
		</MkSelect>

		<MkInput v-model="geminiPromptNote" type="text">
			<template #label>{{ i18n.ts._llm.geminiSummarizePromptLabel }}</template>
			<template #caption>{{ i18n.ts._llm.geminiSummarizePromptCaption }}</template>
		</MkInput>

		<MkInput v-model="geminiPromptProfile" type="text">
			<template #label>{{ i18n.ts._llm.geminiProfileSummarizePromptLabel }}</template>
			<template #caption>{{ i18n.ts._llm.geminiProfileSummarizePromptCaption }}</template>
		</MkInput>

		<div class="_buttons">
			<MkButton primary @click="saveLLMSettings">{{ i18n.ts.save }}</MkButton>
		</div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkButton from '@/components/MkButton.vue';
import { defaultStore } from '@/store.js';
import { reloadAsk } from '@/scripts/reload-ask.js';
import { i18n } from '@/i18n.js';

const geminiToken = computed(defaultStore.makeGetterSetter('geminiToken'));
const geminiModels = computed(defaultStore.makeGetterSetter('geminiModels'));
const geminiPromptNote = computed(defaultStore.makeGetterSetter('geminiPromptNote'));
const geminiPromptProfile = computed(defaultStore.makeGetterSetter('geminiPromptProfile'));

async function saveLLMSettings() {
	await reloadAsk({ reason: i18n.ts.reloadToApplySetting, unison: true });
}
</script>

<style lang="scss" module>
.label {
    font-size: 0.85em;
    padding: 0 0 8px 0;
    user-select: none;
}
</style>
