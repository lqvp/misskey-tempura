<!--
SPDX-FileCopyrightText: lqvp
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker markerId="temp-settings-llm" :inlining="['temp-settings-root']" path="/settings/temp-settings" :keywords="['llm', 'ai', 'language model']">
	<MkFolder>
		<template #icon><i class="ti ti-robot"></i></template>
		<template #label><SearchLabel>{{ i18n.ts._llm.title }}</SearchLabel></template>

		<div class="_gaps_m">
			<SearchMarker :keywords="['llm', 'gemini', 'api', 'server']">
				<MkPreferenceContainer k="useGeminiLLMAPI">
					<MkSwitch v-if="instance?.serverGeminiEnabled && $i?.policies.canUseGeminiLLMAPI" v-model="useGeminiLLMAPI">
						<SearchLabel>{{ i18n.ts._llm.useGeminiLLMAPI }}</SearchLabel>
						<template #caption>{{ i18n.ts._llm.useGeminiLLMAPIDescription }}</template>
					</MkSwitch>
				</MkPreferenceContainer>
			</SearchMarker>

			<SearchMarker :keywords="['llm', 'gemini', 'media', 'images', 'photos']">
				<MkPreferenceContainer k="useGeminiWithMedia">
					<MkSwitch v-model="useGeminiWithMedia">
						<SearchLabel>{{ i18n.ts._llm.useGeminiWithMedia }}</SearchLabel>
						<template #caption>{{ i18n.ts._llm.useGeminiWithMediaDescription }}</template>
					</MkSwitch>
				</MkPreferenceContainer>
			</SearchMarker>

			<SearchMarker :keywords="['llm', 'gemini', 'token', 'api key']">
				<MkPreferenceContainer k="geminiToken">
					<MkInput v-model="geminiToken" type="text" :disabled="useGeminiLLMAPI">
						<template #label><SearchLabel>{{ i18n.ts._llm.geminiTokenLabel }}</SearchLabel></template>
						<template #caption>{{ i18n.ts._llm.geminiTokenCaption }}</template>
					</MkInput>
				</MkPreferenceContainer>
			</SearchMarker>

			<SearchMarker :keywords="['llm', 'gemini', 'model', 'version']">
				<MkPreferenceContainer k="geminiModels">
					<MkSelect v-model="geminiModels" :disabled="useGeminiLLMAPI">
						<template #label><SearchLabel>{{ i18n.ts._llm.geminiModelLabel }}</SearchLabel></template>
						<option value="gemini-2.0-flash-lite">gemini-2.0-flash-lite</option>
						<option value="gemini-2.0-flash">gemini-2.0-flash</option>
						<option value="gemini-1.5-flash">gemini-1.5-flash</option>
						<option value="gemini-1.5-pro">gemini-1.5-pro</option>
						<option value="gemini-2.0-pro-exp-02-05">gemini-2.0-pro-exp-02-05</option>
					</MkSelect>
				</MkPreferenceContainer>
			</SearchMarker>

			<SearchMarker :keywords="['llm', 'gemini', 'system', 'prompt', 'instruction']">
				<MkPreferenceContainer k="geminiSystemPrompt">
					<MkInput v-model="geminiSystemPrompt" type="text">
						<template #label><SearchLabel>{{ i18n.ts._llm.geminiSystemPromptLabel }}</SearchLabel></template>
						<template #caption>{{ i18n.ts._llm.geminiSystemPromptCaption }}</template>
					</MkInput>
				</MkPreferenceContainer>
			</SearchMarker>

			<SearchMarker :keywords="['llm', 'gemini', 'note', 'summarize', 'prompt']">
				<MkPreferenceContainer k="geminiPromptNote">
					<MkInput v-model="geminiPromptNote" type="text">
						<template #label><SearchLabel>{{ i18n.ts._llm.geminiSummarizePromptLabel }}</SearchLabel></template>
						<template #caption>{{ i18n.ts._llm.geminiSummarizePromptCaption }}</template>
					</MkInput>
				</MkPreferenceContainer>
			</SearchMarker>

			<SearchMarker :keywords="['llm', 'gemini', 'profile', 'summarize', 'prompt']">
				<MkPreferenceContainer k="geminiPromptProfile">
					<MkInput v-model="geminiPromptProfile" type="text">
						<template #label><SearchLabel>{{ i18n.ts._llm.geminiProfileSummarizePromptLabel }}</SearchLabel></template>
						<template #caption>{{ i18n.ts._llm.geminiProfileSummarizePromptCaption }}</template>
					</MkInput>
				</MkPreferenceContainer>
			</SearchMarker>

			<MkFolder>
				<template #icon><i class="ti ti-info"></i></template>
				<template #label>{{ i18n.ts._llm.notesPrompt }}</template>

				<div class="_gaps_m">
					<SearchMarker :keywords="['llm', 'gemini', 'notes', 'long', 'text', 'format']">
						<MkPreferenceContainer k="geminiNoteLongText">
							<MkInput v-model="geminiNoteLongText" type="text">
								<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteLongText }}</SearchLabel></template>
							</MkInput>
						</MkPreferenceContainer>
					</SearchMarker>

					<SearchMarker :keywords="['llm', 'gemini', 'notes', 'short', 'text', 'format']">
						<MkPreferenceContainer k="geminiNoteShortText">
							<MkInput v-model="geminiNoteShortText" type="text">
								<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteShortText }}</SearchLabel></template>
							</MkInput>
						</MkPreferenceContainer>
					</SearchMarker>

					<SearchMarker :keywords="['llm', 'gemini', 'notes', 'simple', 'text', 'format']">
						<MkPreferenceContainer k="geminiNoteSimpleText">
							<MkInput v-model="geminiNoteSimpleText" type="text">
								<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteSimpleText }}</SearchLabel></template>
							</MkInput>
						</MkPreferenceContainer>
					</SearchMarker>

					<SearchMarker :keywords="['llm', 'gemini', 'notes', 'casual', 'text', 'format']">
						<MkPreferenceContainer k="geminiNoteCasualText">
							<MkInput v-model="geminiNoteCasualText" type="text">
								<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteCasualText }}</SearchLabel></template>
							</MkInput>
						</MkPreferenceContainer>
					</SearchMarker>

					<SearchMarker :keywords="['llm', 'gemini', 'notes', 'professional', 'text', 'format']">
						<MkPreferenceContainer k="geminiNoteProfessionalText">
							<MkInput v-model="geminiNoteProfessionalText" type="text">
								<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteProfessionalText }}</SearchLabel></template>
							</MkInput>
						</MkPreferenceContainer>
					</SearchMarker>

					<SearchMarker :keywords="['llm', 'gemini', 'notes', 'cat', 'text', 'format']">
						<MkPreferenceContainer k="geminiNoteCatText">
							<MkInput v-model="geminiNoteCatText" type="text">
								<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteCatText }}</SearchLabel></template>
							</MkInput>
						</MkPreferenceContainer>
					</SearchMarker>

					<SearchMarker :keywords="['llm', 'gemini', 'notes', 'custom', 'text', 'format']">
						<MkPreferenceContainer k="geminiNoteCustomText">
							<MkInput v-model="geminiNoteCustomText" type="text">
								<template #label><SearchLabel>{{ i18n.ts._llm.geminiNoteCustomText }}</SearchLabel></template>
							</MkInput>
						</MkPreferenceContainer>
					</SearchMarker>
				</div>
			</MkFolder>

			<div class="_buttons">
				<MkButton primary @click="saveLLMSettings">{{ i18n.ts.save }}</MkButton>
			</div>
		</div>
	</MkFolder>
</SearchMarker>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkButton from '@/components/MkButton.vue';
import { prefer } from '@/preferences.js';
import { reloadAsk } from '@/utility/reload-ask.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { fetchInstance } from '@/instance.js';
import MkPreferenceContainer from '@/components/MkPreferenceContainer.vue';

const instance = ref<Misskey.entities.MetaDetailed | null>(null);

fetchInstance(true).then((res) => {
	instance.value = res;
});

const useGeminiLLMAPI = prefer.model('useGeminiLLMAPI');
const useGeminiWithMedia = prefer.model('useGeminiWithMedia');
const geminiToken = prefer.model('geminiToken');
const geminiModels = prefer.model('geminiModels');
const geminiSystemPrompt = prefer.model('geminiSystemPrompt');
const geminiPromptNote = prefer.model('geminiPromptNote');
const geminiPromptProfile = prefer.model('geminiPromptProfile');
const geminiNoteLongText = prefer.model('geminiNoteLongText');
const geminiNoteShortText = prefer.model('geminiNoteShortText');
const geminiNoteSimpleText = prefer.model('geminiNoteSimpleText');
const geminiNoteCasualText = prefer.model('geminiNoteCasualText');
const geminiNoteProfessionalText = prefer.model('geminiNoteProfessionalText');
const geminiNoteCatText = prefer.model('geminiNoteCatText');
const geminiNoteCustomText = prefer.model('geminiNoteCustomText');

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
