<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-robot"></i></template>
	<template #label>{{ i18n.ts._llm.title }}</template>

	<div class="_gaps_m">
		<MkSwitch v-if="$i?.policies.canUseGeminiLLMAPI" v-model="useGeminiLLMAPI">
			{{ i18n.ts._llm.useGeminiLLMAPI }}
			<template #caption>{{ i18n.ts._llm.useGeminiLLMAPIDescription }}</template>
		</MkSwitch>

		<MkInput v-model="geminiToken" type="text" :disabled="useGeminiLLMAPI">
			<template #label>{{ i18n.ts._llm.geminiTokenLabel }}</template>
			<template #caption>{{ i18n.ts._llm.geminiTokenCaption }}</template>
		</MkInput>

		<MkSelect v-model="geminiModels" :disabled="useGeminiLLMAPI">
			<template #label>{{ i18n.ts._llm.geminiModelLabel }}</template>
			<option value="gemini-2.0-flash">gemini-2.0-flash</option>
			<option value="gemini-1.5-flash">gemini-1.5-flash</option>
			<option value="gemini-1.5-pro">gemini-1.5-pro</option>
			<option value="gemini-2.0-pro-exp-02-05">gemini-2.0-pro-exp-02-05</option>
		</MkSelect>

		<MkInput v-model="geminiSystemPrompt" type="text">
			<template #label>{{ i18n.ts._llm.geminiSystemPromptLabel }}</template>
			<template #caption>{{ i18n.ts._llm.geminiSystemPromptCaption }}</template>
		</MkInput>

		<MkInput v-model="geminiPromptNote" type="text">
			<template #label>{{ i18n.ts._llm.geminiSummarizePromptLabel }}</template>
			<template #caption>{{ i18n.ts._llm.geminiSummarizePromptCaption }}</template>
		</MkInput>

		<MkInput v-model="geminiPromptProfile" type="text">
			<template #label>{{ i18n.ts._llm.geminiProfileSummarizePromptLabel }}</template>
			<template #caption>{{ i18n.ts._llm.geminiProfileSummarizePromptCaption }}</template>
		</MkInput>

		<MkFolder>
			<template #icon><i class="ti ti-info"></i></template>
			<template #label>{{ i18n.ts._llm.notesPrompt }}</template>

			<div class="_gaps_m">
				<MkInput v-model="geminiNoteLongText" type="text">
					<template #label>{{ i18n.ts._llm.geminiNoteLongText }}</template>
				</MkInput>

				<MkInput v-model="geminiNoteShortText" type="text">
					<template #label>{{ i18n.ts._llm.geminiNoteShortText }}</template>
				</MkInput>

				<MkInput v-model="geminiNoteSimpleText" type="text">
					<template #label>{{ i18n.ts._llm.geminiNoteSimpleText }}</template>
				</MkInput>

				<MkInput v-model="geminiNoteCasualText" type="text">
					<template #label>{{ i18n.ts._llm.geminiNoteCasualText }}</template>
				</MkInput>

				<MkInput v-model="geminiNoteProfessionalText" type="text">
					<template #label>{{ i18n.ts._llm.geminiNoteProfessionalText }}</template>
				</MkInput>

				<MkInput v-model="geminiNoteCatText" type="text">
					<template #label>{{ i18n.ts._llm.geminiNoteCatText }}</template>
				</MkInput>

				<MkInput v-model="geminiNoteCustomText" type="text">
					<template #label>{{ i18n.ts._llm.geminiNoteCustomText }}</template>
				</MkInput>
			</div>
		</MkFolder>

		<div class="_buttons">
			<MkButton primary @click="saveLLMSettings">{{ i18n.ts.save }}</MkButton>
		</div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkButton from '@/components/MkButton.vue';
import { defaultStore } from '@/store.js';
import { reloadAsk } from '@/scripts/reload-ask.js';
import { $i } from '@/account.js';
import { i18n } from '@/i18n.js';

const useGeminiLLMAPI = computed(defaultStore.makeGetterSetter('useGeminiLLMAPI'));
const geminiToken = computed(defaultStore.makeGetterSetter('geminiToken'));
const geminiModels = computed(defaultStore.makeGetterSetter('geminiModels'));
const geminiSystemPrompt = computed(defaultStore.makeGetterSetter('geminiSystemPrompt'));
const geminiPromptNote = computed(defaultStore.makeGetterSetter('geminiPromptNote'));
const geminiPromptProfile = computed(defaultStore.makeGetterSetter('geminiPromptProfile'));
const geminiNoteLongText = computed(defaultStore.makeGetterSetter('geminiNoteLongText'));
const geminiNoteShortText = computed(defaultStore.makeGetterSetter('geminiNoteShortText'));
const geminiNoteSimpleText = computed(defaultStore.makeGetterSetter('geminiNoteSimpleText'));
const geminiNoteCasualText = computed(defaultStore.makeGetterSetter('geminiNoteCasualText'));
const geminiNoteProfessionalText = computed(defaultStore.makeGetterSetter('geminiNoteProfessionalText'));
const geminiNoteCatText = computed(defaultStore.makeGetterSetter('geminiNoteCatText'));
const geminiNoteCustomText = computed(defaultStore.makeGetterSetter('geminiNoteCustomText'));

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
